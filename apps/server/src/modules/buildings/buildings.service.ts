import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

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

  async getStructure(orgId: string) {
    return this.prisma.building.findMany({
      where: { orgId },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            restrooms: {
              include: {
                devices: { select: { id: true, deviceCode: true, isOnline: true, lastHeartbeat: true, kioskTemplateId: true } },
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

  async createBuilding(orgId: string, dto: { name: string; address?: string }) {
    return this.prisma.building.create({ data: { orgId, name: dto.name, address: dto.address ?? '' } });
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

  async heartbeat(deviceCode: string) {
    return this.prisma.device.update({
      where: { deviceCode },
      data: { lastHeartbeat: new Date(), isOnline: true },
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

  async updateTemplate(templateId: string, dto: { name?: string; buttons?: any[]; theme?: string }) {
    const template = await this.prisma.kioskTemplate.update({ where: { id: templateId }, data: dto });
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
   * Priority: device.kioskTemplate → building.kioskTemplate → null
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
    return device.kioskTemplate ?? device.restroom.floor.building.kioskTemplate ?? null;
  }

  async getKioskButtons(deviceCode: string) {
    const template = await this.resolveTemplate(deviceCode);
    return template ? (template.buttons as any[]) : this.defaultButtons();
  }

  async getKioskConfig(deviceCode: string) {
    const template = await this.resolveTemplate(deviceCode);
    return {
      theme: template?.theme ?? 'default',
      buttons: template ? (template.buttons as any[]) : this.defaultButtons(),
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
    };
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

  async deleteBuilding(buildingId: string) {
    const restrooms = await this.prisma.restroom.findMany({
      where: { floor: { buildingId } },
      select: { id: true },
    });
    await this.deleteIncidentsForRestrooms(restrooms.map((r) => r.id));
    return this.prisma.building.delete({ where: { id: buildingId } });
  }

  async deleteFloor(floorId: string) {
    const restrooms = await this.prisma.restroom.findMany({
      where: { floorId },
      select: { id: true },
    });
    await this.deleteIncidentsForRestrooms(restrooms.map((r) => r.id));
    return this.prisma.floor.delete({ where: { id: floorId } });
  }

  async deleteRestroom(restroomId: string) {
    await this.deleteIncidentsForRestrooms([restroomId]);
    return this.prisma.restroom.delete({ where: { id: restroomId } });
  }

  async deleteDevice(deviceId: string) {
    const incidents = await this.prisma.incident.findMany({
      where: { deviceId },
      select: { id: true },
    });
    const incidentIds = incidents.map((i) => i.id);
    if (incidentIds.length > 0) {
      await this.prisma.incidentAction.deleteMany({ where: { incidentId: { in: incidentIds } } });
      await this.prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
    }
    return this.prisma.device.delete({ where: { id: deviceId } });
  }
}
