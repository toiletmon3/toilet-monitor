import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { RESPONSE_TIME_RESET_AT } from '../../common/response-time-reset';

const OFFLINE_AFTER_MS = 90_000; // mark offline if no heartbeat for 90s (1.5× the 60s interval)

@Injectable()
export class BuildingsService implements OnModuleInit, OnModuleDestroy {
  constructor(private prisma: PrismaService, private events: EventsGateway) {}

  private _offlineTimer: NodeJS.Timeout | null = null;

  onModuleInit() {
    this._offlineTimer = setInterval(() => this._markStaleDevicesOffline(), 60_000);
  }

  onModuleDestroy() {
    if (this._offlineTimer) clearInterval(this._offlineTimer);
  }

  private async _markStaleDevicesOffline() {
    const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
    await this.prisma.device.updateMany({
      where: {
        isOnline: true,
        OR: [
          { lastHeartbeat: { lt: cutoff } },
          { lastHeartbeat: null },
        ],
      },
      data: { isOnline: false },
    });
  }

  // ── Properties (נכסים) — a grouping layer above buildings ──────────────────

  async getProperties(orgId: string, propertyIds?: string[]) {
    return this.prisma.property.findMany({
      where: { orgId, ...(propertyIds ? { id: { in: propertyIds } } : {}) },
      include: {
        buildings: { select: { id: true, name: true } },
        users: { where: { isActive: true }, select: { id: true, name: true, role: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProperty(orgId: string, name: string) {
    return this.prisma.property.create({ data: { orgId, name } });
  }

  async updateProperty(propertyId: string, name: string) {
    return this.prisma.property.update({ where: { id: propertyId }, data: { name } });
  }

  async deleteProperty(propertyId: string, orgId: string) {
    const owned = await this.prisma.property.findFirst({ where: { id: propertyId, orgId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Property not found');
    // Unlink (never delete) the buildings and users that referenced it
    await this.prisma.building.updateMany({ where: { propertyId }, data: { propertyId: null } });
    await this.prisma.user.updateMany({ where: { propertyId }, data: { propertyId: null } });
    return this.prisma.property.delete({ where: { id: propertyId } });
  }

  async assignBuildingToProperty(buildingId: string, propertyId: string | null) {
    return this.prisma.building.update({ where: { id: buildingId }, data: { propertyId } });
  }

  /** Building ids belonging to a property — used to scope PROPERTY_MANAGER queries. */
  async propertyBuildingIds(propertyId: string): Promise<string[]> {
    const buildings = await this.prisma.building.findMany({ where: { propertyId }, select: { id: true } });
    return buildings.map(b => b.id);
  }

  /**
   * Assert the target entity lives inside the caller's org — and, when
   * `propertyIds` is set (PROPERTY_MANAGER), inside one of their properties.
   * Throws NotFound otherwise so cross-property ids are indistinguishable
   * from nonexistent ones.
   */
  async assertScope(
    orgId: string,
    propertyIds: string[] | undefined,
    target: { buildingId?: string; floorId?: string; restroomId?: string; deviceId?: string },
  ) {
    const building = { orgId, ...(propertyIds ? { propertyId: { in: propertyIds } } : {}) };
    let found: { id: string } | null = null;
    if (target.buildingId) {
      found = await this.prisma.building.findFirst({ where: { id: target.buildingId, ...building }, select: { id: true } });
    } else if (target.floorId) {
      found = await this.prisma.floor.findFirst({ where: { id: target.floorId, building }, select: { id: true } });
    } else if (target.restroomId) {
      found = await this.prisma.restroom.findFirst({ where: { id: target.restroomId, floor: { building } }, select: { id: true } });
    } else if (target.deviceId) {
      found = await this.prisma.device.findFirst({ where: { id: target.deviceId, restroom: { floor: { building } } }, select: { id: true } });
    }
    if (!found) throw new NotFoundException('Not found');
  }

  async getStructure(orgId: string, propertyIds?: string[]) {
    return this.prisma.building.findMany({
      where: { orgId, ...(propertyIds ? { propertyId: { in: propertyIds } } : {}) },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            restrooms: {
              include: {
                devices: { select: { id: true, deviceCode: true, type: true, isOnline: true, lastHeartbeat: true, lastHost: true, hostsSeen: true, kioskTemplateId: true, sensorConfig: true } },
                incidents: {
                  where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
                  select: { id: true, status: true, issueTypeId: true, reportedAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      // kioskTemplateId is returned automatically via include
    });
  }

  async createBuilding(orgId: string, dto: { name: string; address?: string }, propertyId?: string | null) {
    return this.prisma.building.create({
      data: { orgId, name: dto.name, address: dto.address ?? '', ...(propertyId !== undefined ? { propertyId } : {}) },
    });
  }

  async createFloor(buildingId: string, dto: { floorNumber: number; name: string }) {
    return this.prisma.floor.create({ data: { buildingId, ...dto } });
  }

  async createRestroom(floorId: string, dto: { name: string; gender?: 'MALE' | 'FEMALE' | 'UNISEX' }) {
    return this.prisma.restroom.create({ data: { floorId, name: dto.name, gender: dto.gender ?? 'UNISEX' } });
  }

  async registerDevice(restroomId: string, deviceCode: string) {
    return this.prisma.device.upsert({
      where: { deviceCode },
      create: { restroomId, deviceCode, type: 'KIOSK' },
      update: { restroomId },
    });
  }

  async heartbeat(deviceCode: string, host?: string) {
    const cleanHost = host?.replace(/^www\./, '');
    // Track a per-domain last-seen map so simultaneous connections through
    // both domains all stay visible (lastHost alone is last-writer-wins).
    let hostsSeen: Record<string, string> | undefined;
    if (cleanHost) {
      const device = await this.prisma.device.findUnique({
        where: { deviceCode },
        select: { hostsSeen: true },
      });
      hostsSeen = { ...((device?.hostsSeen as Record<string, string> | null) ?? {}) };
      hostsSeen[cleanHost] = new Date().toISOString();
    }
    return this.prisma.device.update({
      where: { deviceCode },
      data: {
        lastHeartbeat: new Date(),
        isOnline: true,
        ...(cleanHost ? { lastHost: cleanHost, hostsSeen } : {}),
      },
    });
  }

  // ── Kiosk templates ──────────────────────────────────────────────────────────

  private defaultButtons() {
    return [
      { code: 'toilet_paper',  nameHe: 'נייר טואלט',     nameEn: 'Toilet Paper',    icon: 'Scroll',    enabled: true, priority: 1 },
      { code: 'floor_cleaning',nameHe: 'ניקוי רצפה',      nameEn: 'Floor Cleaning',  icon: 'Wind',      enabled: true, priority: 2 },
      { code: 'toilet_cleaning',nameHe: 'ניקוי אסלה',     nameEn: 'Toilet Cleaning', icon: 'ShowerHead',enabled: true, priority: 3 },
      { code: 'trash_empty',   nameHe: 'ריקון פח',        nameEn: 'Empty Trash',     icon: 'Trash2',    enabled: true, priority: 4 },
      { code: 'soap_refill',   nameHe: 'מילוי סבון',      nameEn: 'Soap Refill',     icon: 'Droplets',  enabled: true, priority: 5 },
      { code: 'fault_report',  nameHe: 'דיווח על תקלה',   nameEn: 'Fault Report',    icon: 'Wrench',    enabled: true, priority: 6 },
      { code: 'positive_feedback', nameHe: 'עבודה טובה', nameEn: 'Positive Feedback', icon: 'SmilePlus', enabled: true, priority: 0 },
    ];
  }

  /**
   * Built-in templates that every org should see in the Admin UI out of the box.
   * They're created lazily on first access so existing orgs get them automatically.
   */
  private readonly BUILTIN_TEMPLATES: { name: string; heAlias: string; theme: string; isDefault?: boolean }[] = [
    { name: 'Classic', heAlias: 'קלאסי', theme: 'default', isDefault: true },
    { name: 'Neon',    heAlias: 'ניאון',  theme: 'neon' },
  ];

  private async ensureBuiltinTemplates(orgId: string) {
    const existing = await this.prisma.kioskTemplate.findMany({
      where: { orgId },
      select: { id: true, name: true, theme: true },
    });
    const buttons = this.defaultButtons() as any;

    // Always rename legacy Hebrew-named builtin templates to English so
    // the UI shows consistent names regardless of when they were created.
    for (const tpl of this.BUILTIN_TEMPLATES) {
      const hebrewRecord = existing.find(e => e.name === tpl.heAlias && e.theme === tpl.theme);
      if (hebrewRecord) {
        await this.prisma.kioskTemplate.update({
          where: { id: hebrewRecord.id },
          data: { name: tpl.name },
        });
      }
    }

    // Only seed the built-in templates the FIRST time an org accesses the
    // page (when they have zero templates). Re-seeding on every fetch means
    // admins can't permanently delete built-ins, which is the bug we're
    // fixing here. Once an admin has at least one template we never
    // resurrect deleted built-ins.
    if (existing.length === 0) {
      for (const tpl of this.BUILTIN_TEMPLATES) {
        await this.prisma.kioskTemplate.create({
          data: {
            orgId,
            name: tpl.name,
            theme: tpl.theme,
            isDefault: tpl.isDefault ?? false,
            buttons,
          },
        });
      }
    }
  }

  async getTemplates(orgId: string) {
    await this.ensureBuiltinTemplates(orgId);
    return this.prisma.kioskTemplate.findMany({ where: { orgId }, orderBy: { isDefault: 'desc' } });
  }

  async createTemplate(orgId: string, name: string) {
    return this.prisma.kioskTemplate.create({
      data: { orgId, name, buttons: this.defaultButtons() as any },
    });
  }

  async updateTemplate(templateId: string, dto: { name?: string; buttons?: any[]; theme?: string; iconScale?: number; ledSnake?: boolean; statsLayout?: any }) {
    // Clamp the icon scale to a sane range so the kiosk can never be made unusable.
    const data: typeof dto = { ...dto };
    if (typeof data.iconScale === 'number') {
      data.iconScale = Math.min(2.5, Math.max(0.5, data.iconScale));
    }
    const template = await this.prisma.kioskTemplate.update({ where: { id: templateId }, data });
    await this.notifyKiosksOfTemplate(templateId);
    return template;
  }

  async deleteTemplate(templateId: string) {
    // Notify kiosks BEFORE we wipe the link, so we can reach the affected devices.
    await this.notifyKiosksOfTemplate(templateId);
    await this.prisma.building.updateMany({ where: { kioskTemplateId: templateId }, data: { kioskTemplateId: null } });
    await this.prisma.device.updateMany({ where: { kioskTemplateId: templateId }, data: { kioskTemplateId: null } });
    return this.prisma.kioskTemplate.delete({ where: { id: templateId } });
  }

  async assignTemplate(buildingId: string, templateId: string | null) {
    const result = await this.prisma.building.update({ where: { id: buildingId }, data: { kioskTemplateId: templateId } });
    await this.notifyKiosksOfBuilding(buildingId);
    return result;
  }

  async assignTemplateToDevice(deviceId: string, templateId: string | null) {
    const result = await this.prisma.device.update({ where: { id: deviceId }, data: { kioskTemplateId: templateId } });
    await this.notifyKiosksOfDevice(deviceId);
    return result;
  }

  /** Tell every kiosk currently using `templateId` (directly or via its building) to reload. */
  private async notifyKiosksOfTemplate(templateId: string) {
    const directDevices = await this.prisma.device.findMany({
      where: { kioskTemplateId: templateId },
      select: { restroomId: true, deviceCode: true },
    });
    const buildings = await this.prisma.building.findMany({
      where: { kioskTemplateId: templateId },
      select: { floors: { select: { restrooms: { select: { devices: { select: { restroomId: true, deviceCode: true } } } } } } },
    });
    const restroomIds = new Set<string>();
    const deviceCodes = new Set<string>();
    for (const d of directDevices) {
      restroomIds.add(d.restroomId);
      deviceCodes.add(d.deviceCode);
    }
    for (const b of buildings) {
      for (const f of b.floors) {
        for (const r of f.restrooms) {
          for (const d of r.devices) {
            restroomIds.add(d.restroomId);
            deviceCodes.add(d.deviceCode);
          }
        }
      }
    }
    for (const id of restroomIds) this.events.broadcastToRestroom(id, 'kiosk:config-changed', { deviceCodes: [...deviceCodes] });
  }

  private async notifyKiosksOfBuilding(buildingId: string) {
    const devices = await this.prisma.device.findMany({
      where: { restroom: { floor: { buildingId } } },
      select: { restroomId: true, deviceCode: true },
    });
    for (const d of devices) {
      this.events.broadcastToRestroom(d.restroomId, 'kiosk:config-changed', { deviceCodes: [d.deviceCode] });
    }
  }

  private async notifyKiosksOfDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { restroomId: true, deviceCode: true },
    });
    if (device) this.events.broadcastToRestroom(device.restroomId, 'kiosk:config-changed', { deviceCodes: [device.deviceCode] });
  }

  /**
   * Resolve the effective KioskTemplate for a device.
   * Priority: device.kioskTemplate → building.kioskTemplate → org's isDefault template
   */
  private async resolveTemplate(deviceCode: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      include: {
        kioskTemplate: true,
        restroom: { include: { floor: { include: { building: { include: { kioskTemplate: true } } } } } },
      },
    });
    if (!device) return null;
    const explicit = device.kioskTemplate ?? device.restroom.floor.building.kioskTemplate;
    if (explicit) return explicit;

    const orgId = device.restroom.floor.building.orgId;
    return this.prisma.kioskTemplate.findFirst({
      where: { orgId, isDefault: true },
    });
  }

  /**
   * Reject config requests for tablets that were deleted from the admin UI.
   * Without this the kiosk page happily renders a default template for any
   * code, so deleted kiosks look alive forever. A ROOM-* code whose restroom
   * still exists is allowed — it self-registers on first load.
   */
  private async assertKioskCodeAlive(deviceCode: string) {
    const blocked = await this.prisma.blockedDeviceCode.findUnique({ where: { deviceCode } });
    if (blocked) throw new NotFoundException('Device removed');
    const device = await this.prisma.device.findUnique({ where: { deviceCode }, select: { id: true } });
    if (device) return;
    if (deviceCode.startsWith('ROOM-')) {
      const restroom = await this.prisma.restroom.findUnique({
        where: { id: deviceCode.slice(5) },
        select: { id: true },
      });
      if (restroom) return;
    }
    throw new NotFoundException('Device not registered');
  }

  async getKioskButtons(deviceCode: string) {
    await this.assertKioskCodeAlive(deviceCode);
    const template = await this.resolveTemplate(deviceCode);
    return template ? (template.buttons as any[]) : this.defaultButtons();
  }

  async getKioskConfig(deviceCode: string) {
    await this.assertKioskCodeAlive(deviceCode);
    const template = await this.resolveTemplate(deviceCode);

    // Is a radar presence sensor paired to this kiosk's restroom?
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      select: { restroomId: true },
    });
    const restroomId =
      device?.restroomId ?? (deviceCode.startsWith('ROOM-') ? deviceCode.slice(5) : null);
    let sensor: { present: boolean; online: boolean } = { present: false, online: false };
    if (restroomId) {
      const sensors = await this.prisma.device.findMany({
        where: { restroomId, type: 'SENSOR' },
        select: { isOnline: true },
      });
      sensor = { present: sensors.length > 0, online: sensors.some((s) => s.isOnline) };
    }

    return {
      theme: template?.theme ?? 'default',
      buttons: template ? (template.buttons as any[]) : this.defaultButtons(),
      iconScale: template?.iconScale ?? 1,
      ledSnake: template?.ledSnake ?? false,
      statsLayout: (template as any)?.statsLayout ?? null,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      sensor,
    };
  }

  /**
   * Human-readable overview of which kiosk template each tablet resolves to,
   * for quick copy-paste-a-link diagnosis (same spirit as /api/email/diagnose).
   * Shows the full resolution chain: device → building → org default.
   */
  async kioskDiagnose(orgId: string) {
    const devices = await this.prisma.device.findMany({
      where: { restroom: { floor: { building: { orgId } } } },
      include: {
        kioskTemplate: { select: { name: true, theme: true, buttons: true } },
        restroom: {
          include: {
            floor: {
              include: {
                building: { include: { kioskTemplate: { select: { name: true, theme: true, buttons: true } } } },
              },
            },
          },
        },
      },
      orderBy: { deviceCode: 'asc' },
    });
    const orgDefaults = await this.prisma.kioskTemplate.findMany({
      where: { isDefault: true, orgId },
      select: { orgId: true, name: true, theme: true, buttons: true },
    });

    // Active issue-type codes per org. A kiosk button whose code has no active
    // IssueType is a dead button: the tap is silently dropped client-side
    // (handleIssuePress finds no issueType and returns without reporting).
    const orgIds = [...new Set(devices.map(d => d.restroom.floor.building.orgId))];
    const issueTypes = await this.prisma.issueType.findMany({
      where: { OR: [{ orgId: { in: orgIds } }, { orgId: null }], isActive: true },
      select: { code: true, orgId: true },
    });
    const activeCodesFor = (orgId: string) =>
      new Set(issueTypes.filter(t => t.orgId === orgId || t.orgId === null).map(t => t.code));

    // Same numbers the kiosk itself displays (see analytics getKioskStatsByBuilding):
    // reports this week / today, and avg response time over resolved incidents (30d).
    const buildingIds = [...new Set(devices.map(d => d.restroom.floor.building.id))];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Keep in sync with AnalyticsService.KIOSK_AVG_BASELINE_MINUTES — until
    // enough post-reset data accumulates the avg shows this baseline.
    const avgBaselineMinutes = 2;
    const avgSince = monthAgo > RESPONSE_TIME_RESET_AT ? monthAgo : RESPONSE_TIME_RESET_AT;
    const statsByBuilding = new Map<string, {
      weeklyReports: number; dailyReports: number; avgResponseMinutes: number | null;
      weeklyByType: Record<string, number>; todayByType: Record<string, number>;
    }>();
    for (const buildingId of buildingIds) {
      const buildingFilter = { restroom: { floor: { buildingId } } };
      const [weekIncidents, resolved] = await Promise.all([
        this.prisma.incident.findMany({
          where: { ...buildingFilter, reportedAt: { gte: weekAgo } },
          select: { reportedAt: true, issueType: { select: { code: true } } },
        }),
        this.prisma.incident.findMany({
          where: { ...buildingFilter, status: 'RESOLVED', resolvedAt: { not: null }, reportedAt: { gte: avgSince } },
          select: { reportedAt: true, resolvedAt: true },
        }),
      ]);
      const weeklyByType: Record<string, number> = {};
      const todayByType: Record<string, number> = {};
      let dailyReports = 0;
      for (const inc of weekIncidents) {
        const code = inc.issueType?.code ?? 'unknown';
        weeklyByType[code] = (weeklyByType[code] ?? 0) + 1;
        if (inc.reportedAt >= todayStart) {
          todayByType[code] = (todayByType[code] ?? 0) + 1;
          dailyReports++;
        }
      }
      const avg = resolved.length > 0
        ? Math.round(resolved.reduce((sum, i) => sum + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0) / resolved.length)
        : avgBaselineMinutes;
      statsByBuilding.set(buildingId, {
        weeklyReports: weekIncidents.length,
        dailyReports,
        avgResponseMinutes: avg,
        weeklyByType,
        todayByType,
      });
    }

    const fmt = (t: { name: string; theme: string } | null | undefined) =>
      t ? `${t.name} (${t.theme})` : null;
    return devices.map(d => {
      const building = d.restroom.floor.building;
      const orgDefault = orgDefaults.find(t => t.orgId === building.orgId) ?? null;
      const effective = d.kioskTemplate ?? building.kioskTemplate ?? orgDefault;
      const activeCodes = activeCodesFor(building.orgId);
      const buttons = ((effective as any)?.buttons as any[] | undefined) ?? this.defaultButtons();
      const deadButtons = buttons
        .filter(b => b?.enabled !== false && b?.code && !activeCodes.has(b.code))
        .map(b => b.code);
      return {
        deviceCode: d.deviceCode,
        building: building.name,
        floor: d.restroom.floor.name,
        restroom: d.restroom.name,
        assignedToDevice: fmt(d.kioskTemplate),
        assignedToBuilding: fmt(building.kioskTemplate),
        orgDefault: fmt(orgDefault),
        effectiveTemplate: fmt(effective) ?? 'default (default)',
        effectiveTheme: effective?.theme ?? 'default',
        stats: statsByBuilding.get(building.id) ?? null,
        activeIssueTypeCodes: [...activeCodes],
        // Buttons on this kiosk whose taps are silently dropped (no active IssueType)
        deadButtons,
      };
    });
  }

  async getPublicStructure(orgId: string) {
    return this.prisma.building.findMany({
      where: { orgId },
      select: {
        id: true, name: true,
        floors: {
          orderBy: { floorNumber: 'asc' },
          select: {
            id: true, name: true, floorNumber: true,
            restrooms: {
              select: { id: true, name: true, gender: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getIssueTypes(orgId: string) {
    return this.prisma.issueType.findMany({
      where: { OR: [{ orgId }, { orgId: null }], isActive: true },
      orderBy: { priority: 'asc' },
    });
  }

  async updateBuilding(buildingId: string, dto: { name?: string; address?: string }) {
    return this.prisma.building.update({ where: { id: buildingId }, data: dto });
  }

  async updateFloor(floorId: string, dto: { name?: string; floorNumber?: number }) {
    return this.prisma.floor.update({ where: { id: floorId }, data: dto });
  }

  async updateRestroom(restroomId: string, dto: { name?: string; gender?: string }) {
    return this.prisma.restroom.update({ where: { id: restroomId }, data: dto as any });
  }

  private async deleteIncidentsForRestrooms(restroomIds: string[]) {
    if (restroomIds.length === 0) return;
    const incidents = await this.prisma.incident.findMany({
      where: { restroomId: { in: restroomIds } },
      select: { id: true },
    });
    const incidentIds = incidents.map((i) => i.id);
    if (incidentIds.length > 0) {
      await this.prisma.incidentAction.deleteMany({ where: { incidentId: { in: incidentIds } } });
      await this.prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
    }
  }

  async deleteBuilding(buildingId: string, orgId: string) {
    const owned = await this.prisma.building.findFirst({ where: { id: buildingId, orgId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Building not found');
    const restrooms = await this.prisma.restroom.findMany({
      where: { floor: { buildingId } },
      select: { id: true },
    });
    const restroomIds = restrooms.map((r) => r.id);
    const devices = await this.devicesOfRestrooms(restroomIds);
    await this.deleteIncidentsForRestrooms(restroomIds);
    const deleted = await this.prisma.building.delete({ where: { id: buildingId } });
    await this.blockAndKickDevices(devices);
    return deleted;
  }

  async deleteFloor(floorId: string, orgId: string) {
    const owned = await this.prisma.floor.findFirst({ where: { id: floorId, building: { orgId } }, select: { id: true } });
    if (!owned) throw new NotFoundException('Floor not found');
    const restrooms = await this.prisma.restroom.findMany({
      where: { floorId },
      select: { id: true },
    });
    const restroomIds = restrooms.map((r) => r.id);
    const devices = await this.devicesOfRestrooms(restroomIds);
    await this.deleteIncidentsForRestrooms(restroomIds);
    const deleted = await this.prisma.floor.delete({ where: { id: floorId } });
    await this.blockAndKickDevices(devices);
    return deleted;
  }

  async deleteRestroom(restroomId: string, orgId: string) {
    const owned = await this.prisma.restroom.findFirst({ where: { id: restroomId, floor: { building: { orgId } } }, select: { id: true } });
    if (!owned) throw new NotFoundException('Restroom not found');
    const devices = await this.devicesOfRestrooms([restroomId]);
    await this.deleteIncidentsForRestrooms([restroomId]);
    const deleted = await this.prisma.restroom.delete({ where: { id: restroomId } });
    await this.blockAndKickDevices(devices);
    return deleted;
  }

  async deleteDevice(deviceId: string, orgId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, restroom: { floor: { building: { orgId } } } },
      select: { deviceCode: true, restroomId: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    const incidents = await this.prisma.incident.findMany({
      where: { deviceId },
      select: { id: true },
    });
    const incidentIds = incidents.map((i) => i.id);
    if (incidentIds.length > 0) {
      await this.prisma.incidentAction.deleteMany({ where: { incidentId: { in: incidentIds } } });
      await this.prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
    }
    const deleted = await this.prisma.device.delete({ where: { id: deviceId } });
    if (device) await this.blockAndKickDevices([device]);
    return deleted;
  }

  private devicesOfRestrooms(restroomIds: string[]) {
    if (restroomIds.length === 0) return Promise.resolve([]);
    return this.prisma.device.findMany({
      where: { restroomId: { in: restroomIds } },
      select: { deviceCode: true, restroomId: true },
    });
  }

  /**
   * Kiosk URLs are public and ROOM-* codes self-register, so deleting the DB
   * row alone lets the tablet resurrect itself (or keep faking success via the
   * offline queue). Blocking the code makes the deletion stick, and the
   * config-changed broadcast reloads any tablet that still has the page open
   * so it lands on the "device removed" screen immediately.
   */
  private async blockAndKickDevices(devices: Array<{ deviceCode: string; restroomId: string }>) {
    for (const d of devices) {
      await this.prisma.blockedDeviceCode.upsert({
        where: { deviceCode: d.deviceCode },
        create: { deviceCode: d.deviceCode },
        update: { blockedAt: new Date() },
      });
      this.events.broadcastToRestroom(d.restroomId, 'kiosk:config-changed', { deviceCodes: [d.deviceCode] });
    }
  }
}
