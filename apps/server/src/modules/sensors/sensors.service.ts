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

    this.events.broadcastToRestroom(device.restroomId, 'sensor:presence', {
      restroomId: device.restroomId,
      deviceCode,
      occupied: dto.status === 'occupied',
      targets: dto.targets ?? 0,
      radarAlive: dto.radarAlive ?? true,
      at: new Date().toISOString(),
    });

    return { ok: true };
  }

  /** Today's visit count + live status per restroom, for dashboards. */
  async restroomSummary(restroomId: string) {
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
}
