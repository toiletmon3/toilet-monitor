import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

export interface SensorReportDto {
  status?: 'occupied' | 'empty';
  targets?: number;
  radarAlive?: boolean;
  firmware?: string;
  event?: 'presence_start' | 'presence_end';
  durationSec?: number;
}

@Injectable()
export class SensorsService {
  // Last raw report per device, in-memory (single PM2 process) — the radar
  // wiring diagnostic: radarAlive=false with a fresh heartbeat means WiFi is
  // fine but no UART data arrives from the LD2450 (swapped/loose TX-RX).
  private lastReports = new Map<string, { at: string; report: SensorReportDto }>();

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  /**
   * Radar bridges report with a SENS-<restroomId> code and self-register on
   * first contact — same trust model as ROOM-* kiosk codes (the code is only
   * obtainable from the admin /flash page). Blocked codes stay dead.
   */
  private async resolveDevice(deviceCode: string) {
    const blocked = await this.prisma.blockedDeviceCode.findUnique({ where: { deviceCode } });
    if (blocked) throw new NotFoundException('Device removed');

    const existing = await this.prisma.device.findUnique({ where: { deviceCode } });
    if (existing) return existing;

    if (deviceCode.startsWith('SENS-')) {
      const restroom = await this.prisma.restroom.findUnique({
        where: { id: deviceCode.slice(5) },
        select: { id: true },
      });
      if (restroom) {
        return this.prisma.device.create({
          data: { deviceCode, restroomId: restroom.id, type: 'SENSOR' },
        });
      }
    }
    throw new NotFoundException('Device not registered');
  }

  async report(deviceCode: string, dto: SensorReportDto) {
    const device = await this.resolveDevice(deviceCode);
    this.lastReports.set(deviceCode, { at: new Date().toISOString(), report: dto });

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastHeartbeat: new Date(), isOnline: true },
    });

    if (dto.event === 'presence_start' || dto.event === 'presence_end') {
      await this.prisma.sensorEvent.create({
        data: {
          deviceId: device.id,
          restroomId: device.restroomId,
          type: dto.event,
          durationSec: dto.durationSec ?? null,
          targets: dto.targets ?? null,
        },
      });
    }

    const payload = {
      restroomId: device.restroomId,
      deviceCode,
      occupied: dto.status === 'occupied',
      targets: dto.targets ?? 0,
      radarAlive: dto.radarAlive ?? true,
      at: new Date().toISOString(),
    };
    this.events.broadcastToRestroom(device.restroomId, 'sensor:presence', payload);

    // Admin pages listen on the org room, so mirror the event there too.
    const restroom = await this.prisma.restroom.findUnique({
      where: { id: device.restroomId },
      select: { floor: { select: { building: { select: { orgId: true } } } } },
    });
    const orgId = restroom?.floor.building.orgId;
    if (orgId) this.events.broadcastToOrg(orgId, 'sensor:presence', payload);

    // Piggyback tuning config on the response — the bridge applies and
    // persists it, so admin changes reach the sensor within one report cycle.
    return { ok: true, config: (device as any).sensorConfig ?? null };
  }

  /**
   * Admin tuning of the visit-counting behavior (values in seconds).
   * `caller` confines the write to the caller's org, and — for a property
   * manager (propertyIds set) — to devices inside their own properties.
   */
  async updateConfig(deviceId: string, dto: { occupiedAfterSec?: number; emptyAfterSec?: number }, caller?: { orgId: string; propertyIds?: string[] }) {
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        ...(caller ? {
          restroom: { floor: { building: {
            orgId: caller.orgId,
            ...(caller.propertyIds ? { propertyId: { in: caller.propertyIds } } : {}),
          } } },
        } : {}),
      },
      select: { sensorConfig: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const current = (device.sensorConfig as Record<string, number> | null) ?? {};
    const sensorConfig = {
      ...current,
      ...(dto.occupiedAfterSec != null ? { occupiedAfterMs: clamp(dto.occupiedAfterSec, 1, 30) * 1000 } : {}),
      ...(dto.emptyAfterSec != null ? { emptyAfterMs: clamp(dto.emptyAfterSec, 3, 300) * 1000 } : {}),
    };
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { sensorConfig },
      select: { id: true, deviceCode: true, sensorConfig: true },
    });
  }

  /**
   * Per-restroom sensor status — powers the admin devices page. `propertyIds`
   * (property managers) narrows it to their own properties' sensors.
   */
  async orgSummary(orgId: string, propertyIds?: string[]) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sensors = await this.prisma.device.findMany({
      where: {
        type: 'SENSOR',
        restroom: { floor: { building: { orgId, ...(propertyIds ? { propertyId: { in: propertyIds } } : {}) } } },
      },
      select: { restroomId: true },
    });
    const restroomIds = [...new Set(sensors.map((s) => s.restroomId))];
    if (restroomIds.length === 0) return [];

    const [visitCounts, latestEvents] = await Promise.all([
      this.prisma.sensorEvent.groupBy({
        by: ['restroomId'],
        where: { restroomId: { in: restroomIds }, type: 'presence_end', createdAt: { gte: startOfDay } },
        _count: { _all: true },
      }),
      // distinct + orderBy desc = newest event per restroom
      this.prisma.sensorEvent.findMany({
        where: { restroomId: { in: restroomIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['restroomId'],
        select: { restroomId: true, type: true, createdAt: true },
      }),
    ]);

    const visitsByRestroom = new Map(visitCounts.map((v) => [v.restroomId, v._count._all]));
    const latestByRestroom = new Map(latestEvents.map((e) => [e.restroomId, e]));

    return restroomIds.map((id) => ({
      restroomId: id,
      visitsToday: visitsByRestroom.get(id) ?? 0,
      occupied: latestByRestroom.get(id)?.type === 'presence_start',
      lastEventAt: latestByRestroom.get(id)?.createdAt ?? null,
    }));
  }

  /**
   * Live wiring/health diagnostic for one sensor, in the spirit of
   * /api/email/diagnose. Public by device code (unguessable), read-only.
   */
  async diagnose(deviceCode: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      select: { id: true, restroomId: true, isOnline: true, lastHeartbeat: true, createdAt: true },
    });
    if (!device) return { registered: false, hint: 'Device has not reported yet' };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [eventsToday, recentEvents] = await Promise.all([
      this.prisma.sensorEvent.count({ where: { deviceId: device.id, createdAt: { gte: startOfDay } } }),
      this.prisma.sensorEvent.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { type: true, durationSec: true, targets: true, createdAt: true },
      }),
    ]);

    const last = this.lastReports.get(deviceCode) ?? null;
    return {
      registered: true,
      isOnline: device.isOnline,
      lastHeartbeat: device.lastHeartbeat,
      registeredAt: device.createdAt,
      lastReport: last, // radarAlive=false here ⇒ no UART data from the LD2450
      eventsToday,
      recentEvents,
      hint:
        last && last.report.radarAlive === false
          ? 'Heartbeats arrive but the radar UART is silent — check TX/RX wiring (likely swapped or loose)'
          : last && last.report.radarAlive === true
            ? 'Radar data is flowing'
            : 'No report received since last server restart — wait up to 60s',
    };
  }

  /** Today's visit count + live status per restroom, for dashboards. */
  async restroomSummary(restroomId: string, caller?: { orgId: string; propertyIds?: string[] }) {
    // Ownership check: the restroom must live in the caller's org (and, for a
    // property manager, inside one of their properties).
    if (caller) {
      const owned = await this.prisma.restroom.findFirst({
        where: {
          id: restroomId,
          floor: { building: {
            orgId: caller.orgId,
            ...(caller.propertyIds ? { propertyId: { in: caller.propertyIds } } : {}),
          } },
        },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Restroom not found');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [visitsToday, lastEvent, sensors] = await Promise.all([
      this.prisma.sensorEvent.count({
        where: { restroomId, type: 'presence_end', createdAt: { gte: startOfDay } },
      }),
      this.prisma.sensorEvent.findFirst({
        where: { restroomId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.findMany({
        where: { restroomId, type: 'SENSOR' },
        select: { deviceCode: true, isOnline: true, lastHeartbeat: true },
      }),
    ]);

    return {
      restroomId,
      visitsToday,
      occupied: lastEvent?.type === 'presence_start',
      lastEventAt: lastEvent?.createdAt ?? null,
      sensors,
    };
  }

  /**
   * Chronological visit log for one restroom's sensor — powers the per-sensor
   * "visit log" dialog in the admin devices page. Each completed visit is a
   * presence_end event (entry time = exit time − durationSec). When the newest
   * event is an unmatched presence_start, the room is occupied right now.
   */
  async eventLog(
    restroomId: string,
    opts: { limit?: number },
    caller?: { orgId: string; propertyIds?: string[] },
  ) {
    if (caller) {
      const owned = await this.prisma.restroom.findFirst({
        where: {
          id: restroomId,
          floor: { building: {
            orgId: caller.orgId,
            ...(caller.propertyIds ? { propertyId: { in: caller.propertyIds } } : {}),
          } },
        },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Restroom not found');
    }

    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

    const events = await this.prisma.sensorEvent.findMany({
      where: { restroomId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // one extra so an open presence_start doesn't crowd out a visit
      select: { id: true, type: true, durationSec: true, targets: true, createdAt: true },
    });

    // Occupied right now when the newest event is a start with no matching end.
    const occupiedSince = events[0]?.type === 'presence_start' ? events[0].createdAt : null;

    const visits = events
      .filter((e) => e.type === 'presence_end')
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        leftAt: e.createdAt,
        enteredAt:
          e.durationSec != null
            ? new Date(e.createdAt.getTime() - e.durationSec * 1000)
            : null,
        durationSec: e.durationSec ?? null,
        targets: e.targets ?? null,
      }));

    return { occupiedSince, visits };
  }
}
