import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Org settings, as the caller should see them.
   * `pmPropertyIds` (set for PROPERTY_MANAGER callers) overlays the daily-report
   * hour/enabled of THEIR property (stored per property under
   * `settings.propertyDailyReports[propertyId]`) over the org-wide values.
   */
  async getOrgSettings(orgId: string, pmPropertyIds?: string[]) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, settings: true } });
    const s = (org?.settings ?? {}) as any;
    const base = {
      name: org?.name ?? '',
      kioskLang: s.kioskLang ?? s.defaultLanguage ?? 'he',
      cleanerLang: s.cleanerLang ?? null,
      kioskTheme: s.kioskTheme ?? 'default',
      timezone: s.timezone ?? 'Asia/Jerusalem',
      dailyReportHour: s.dailyReportHour ?? 7,
      dailyReportEnabled: s.dailyReportEnabled ?? true,
    };
    if (pmPropertyIds?.length) {
      const perProp = (s.propertyDailyReports ?? {})[pmPropertyIds[0]] ?? {};
      return {
        ...base,
        dailyReportHour: perProp.hour ?? base.dailyReportHour,
        dailyReportEnabled: perProp.enabled ?? base.dailyReportEnabled,
      };
    }
    return base;
  }

  async updateOrgSettings(orgId: string, patch: { name?: string; kioskLang?: string; cleanerLang?: string | null; kioskTheme?: string; timezone?: string; dailyReportHour?: number; dailyReportEnabled?: boolean }, pmPropertyIds?: string[]) {
    // A property manager only ever writes the daily-report schedule of their
    // OWN properties — every other org-wide field is silently dropped.
    if (pmPropertyIds) {
      if (pmPropertyIds.length === 0) return this.getOrgSettings(orgId, pmPropertyIds);
      const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
      const current = (org?.settings ?? {}) as any;
      const reports = { ...(current.propertyDailyReports ?? {}) };
      for (const pid of pmPropertyIds) {
        const entry = { ...(reports[pid] ?? {}) };
        if (patch.dailyReportHour !== undefined) entry.hour = patch.dailyReportHour;
        if (patch.dailyReportEnabled !== undefined) entry.enabled = patch.dailyReportEnabled;
        reports[pid] = entry;
      }
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { settings: { ...current, propertyDailyReports: reports } },
      });
      return this.getOrgSettings(orgId, pmPropertyIds);
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const current = (org?.settings ?? {}) as any;
    // `name` is a top-level column on Organization, not part of the settings JSON.
    // Merge ONLY known settings keys (never spread the raw body) so a client
    // can't inject arbitrary keys/values into the persisted settings blob.
    const { name } = patch;
    const ALLOWED_SETTINGS = ['kioskLang', 'cleanerLang', 'kioskTheme', 'timezone', 'dailyReportHour', 'dailyReportEnabled'] as const;
    const updated: any = { ...current };
    for (const key of ALLOWED_SETTINGS) {
      if ((patch as any)[key] !== undefined) updated[key] = (patch as any)[key];
    }
    const data: any = { settings: updated };
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    const saved = await this.prisma.organization.update({ where: { id: orgId }, data, select: { name: true } });
    return {
      name: saved.name,
      kioskLang: updated.kioskLang ?? 'he',
      cleanerLang: updated.cleanerLang ?? null,
      kioskTheme: updated.kioskTheme ?? 'default',
      timezone: updated.timezone ?? 'Asia/Jerusalem',
      dailyReportHour: updated.dailyReportHour ?? 7,
      dailyReportEnabled: updated.dailyReportEnabled ?? true,
    };
  }

  async updateLang(userId: string, preferredLang: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { preferredLang }, select: { id: true, preferredLang: true } });
  }

  /**
   * User "propertyId in ids" filter — direct assignment OR via the assigned
   * building. `propertyIds` is only ever set for PROPERTY_MANAGER callers, so
   * it also hides internal/company accounts (`hiddenFromPm`) — as far as a
   * property manager can tell, those users do not exist.
   */
  private userPropertyFilter(propertyIds?: string[]) {
    return propertyIds
      ? {
          hiddenFromPm: false,
          OR: [{ propertyId: { in: propertyIds } }, { building: { propertyId: { in: propertyIds } } }],
        }
      : {};
  }

  async findAll(orgId: string, propertyIds?: string[], workersOnly = false) {
    // Property scope: users assigned to one of the properties directly, or via
    // a building that belongs to one of them. `workersOnly` (property managers)
    // additionally hides every admin/manager account — as far as a property
    // manager can tell, only the workers of their property exist.
    const propertyFilter = this.userPropertyFilter(propertyIds);
    const roleFilter = workersOnly ? { role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] as any[] } } : {};
    return this.prisma.user.findMany({
      where: { orgId, ...propertyFilter, ...roleFilter },
      select: {
        id: true, name: true, email: true, idNumber: true,
        role: true, phone: true, preferredLang: true, isActive: true, hiddenFromPm: true, createdAt: true,
        buildingId: true,
        building: { select: { id: true, name: true, propertyId: true } },
        propertyId: true,
        property: { select: { id: true, name: true } },
        managedProperties: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCleaner(orgId: string, dto: { name: string; idNumber: string; phone?: string; preferredLang?: string; propertyId?: string }) {
    const exists = await this.prisma.user.findUnique({ where: { orgId_idNumber: { orgId, idNumber: dto.idNumber } } });
    if (exists) throw new ConflictException('ID number already registered');

    return this.prisma.user.create({
      data: {
        orgId,
        name: dto.name,
        idNumber: dto.idNumber,
        phone: dto.phone,
        preferredLang: dto.preferredLang ?? 'he',
        role: 'CLEANER',
        propertyId: dto.propertyId ?? null,
      },
      select: { id: true, name: true, idNumber: true, role: true, isActive: true },
    });
  }

  /** Friendly 409 instead of a raw DB unique-constraint 500 when an ID number is taken. */
  private async assertIdNumberFree(userId: string, idNumber?: string) {
    if (!idNumber) return;
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { orgId: true } });
    if (!me) return;
    const taken = await this.prisma.user.findFirst({
      where: { orgId: me.orgId, idNumber, id: { not: userId } },
      select: { name: true },
    });
    if (taken) throw new ConflictException(`תעודת זהות זו כבר בשימוש אצל ${taken.name}`);
  }

  async createAdmin(orgId: string, dto: { name: string; email: string; password: string; role?: string; propertyId?: string }) {
    // idNumber defaults to the email, so a duplicate email hits the same unique index
    const emailTaken = await this.prisma.user.findFirst({
      where: { orgId, OR: [{ email: dto.email }, { idNumber: dto.email }] },
      select: { name: true },
    });
    if (emailTaken) throw new ConflictException(`האימייל כבר בשימוש אצל ${emailTaken.name}`);

    // Never let SUPER_ADMIN (cross-org superuser) or an unknown role be minted
    // through the API — only these roles may be assigned here. SUPER_ADMIN is
    // provisioned out-of-band (seed/DB), not via user creation.
    const ASSIGNABLE_ROLES = ['ORG_ADMIN', 'MANAGER', 'SHIFT_SUPERVISOR', 'PROPERTY_MANAGER'];
    const role = dto.role ?? 'MANAGER';
    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Cannot assign this role');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        orgId,
        name: dto.name,
        email: dto.email,
        idNumber: dto.email,
        passwordHash,
        role: role as any,
        propertyId: dto.propertyId ?? null,
      },
      select: { id: true, name: true, email: true, role: true, propertyId: true },
    });
  }

  /**
   * Property managers may only touch WORKERS (cleaners + shift supervisors)
   * inside their own property — never other managers. Self-edits are allowed
   * (e.g. changing their own password). Throws for anything else.
   */
  async assertCanManageUser(requester: { id: string; role: string; propertyIds?: string[] }, targetUserId: string) {
    if (requester.role !== 'PROPERTY_MANAGER') return;
    if (requester.id === targetUserId) return; // self-service is fine
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true, propertyId: true, hiddenFromPm: true, building: { select: { propertyId: true } } },
    });
    if (!target) throw new ForbiddenException();
    const mine = requester.propertyIds ?? [];
    const isWorker = target.role === 'CLEANER' || target.role === 'SHIFT_SUPERVISOR';
    const inProperty =
      (!!target.propertyId && mine.includes(target.propertyId)) ||
      (!!target.building?.propertyId && mine.includes(target.building.propertyId));
    // hiddenFromPm accounts are invisible to property managers — also unmanageable
    if (!isWorker || !inProperty || target.hiddenFromPm) {
      throw new ForbiddenException('Property managers can only manage workers of their own properties');
    }
  }

  /** Org-admin toggle: hide/show an internal account in every property-manager view. */
  async setHiddenFromPm(userId: string, hiddenFromPm: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hiddenFromPm },
      select: { id: true, name: true, hiddenFromPm: true },
    });
  }

  /** Replace the full set of properties a property manager manages (checkbox assignment). */
  async setManagedProperties(userId: string, propertyIds: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        managedProperties: { set: propertyIds.map(id => ({ id })) },
        // Keep the legacy single-property column roughly in sync for older reads
        propertyId: propertyIds[0] ?? null,
      },
      select: { id: true, managedProperties: { select: { id: true, name: true } } },
    });
  }

  /** Resolve the org + property a kiosk belongs to (via its building). Handles
   *  real device codes and selector-based ROOM-<restroomId> codes. */
  private async resolveKioskLocation(deviceCode: string): Promise<{ orgId: string; propertyId: string | null } | null> {
    const buildingSelect = { orgId: true, propertyId: true } as const;
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      select: { restroom: { select: { floor: { select: { building: { select: buildingSelect } } } } } },
    });
    let building = device?.restroom?.floor?.building ?? null;
    if (!building && deviceCode.startsWith('ROOM-')) {
      const restroom = await this.prisma.restroom.findUnique({
        where: { id: deviceCode.slice(5) },
        select: { floor: { select: { building: { select: buildingSelect } } } },
      });
      building = restroom?.floor?.building ?? null;
    }
    return building ? { orgId: building.orgId, propertyId: building.propertyId } : null;
  }

  async verifyCleaner(idNumber: string, deviceCode?: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber, role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] } },
      select: { id: true, name: true, isActive: true, role: true, propertyId: true, building: { select: { propertyId: true } } },
    });
    if (!cleaner) return { found: false };
    if (!cleaner.isActive) return { found: false, inactive: true };

    // Property gate: a worker tied to a property can only sign in on that
    // property's kiosks. A worker with no property tie can sign in anywhere
    // (so unassigned staff are never locked out).
    if (deviceCode) {
      const loc = await this.resolveKioskLocation(deviceCode);
      if (loc?.propertyId) {
        const own = [cleaner.propertyId, cleaner.building?.propertyId].filter(Boolean) as string[];
        if (own.length > 0 && !own.includes(loc.propertyId)) {
          return { found: false, wrongProperty: true };
        }
      }
    }

    // Currently on shift? (an open arrival today with no checkout) — lets the
    // kiosk team screen offer check-in OR check-out, not both.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const openArrival = await this.prisma.cleanerArrival.findFirst({
      where: { userId: cleaner.id, arrivedAt: { gte: todayStart }, leftAt: null },
      select: { id: true },
    });
    return { found: true, name: cleaner.name, role: cleaner.role, checkedIn: !!openArrival };
  }

  async verifyAdminByIdNumber(idNumber: string) {
    const admin = await this.prisma.user.findFirst({
      where: { idNumber, role: { in: ['ORG_ADMIN', 'MANAGER'] }, isActive: true },
      select: { id: true, name: true, role: true, orgId: true },
    });
    if (!admin) return { found: false };
    return { found: true, name: admin.name, role: admin.role, orgId: admin.orgId };
  }

  /**
   * Staff assigned to the building this kiosk belongs to, so the tablet can
   * cache the roster while online and let any of them log in during an internet
   * outage — even on a tablet they've never personally used before. Returns the
   * kiosk login credential (idNumber); it is @Public but scoped to a single
   * building via the deviceCode, matching the trust level of the other kiosk
   * endpoints. Falls back to an empty roster for an unknown/blocked device.
   */
  async kioskRoster(deviceCode: string) {
    const loc = await this.resolveKioskLocation(deviceCode);
    if (!loc) return { cleaners: [], admins: [] };

    const { orgId, propertyId } = loc;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Property-scoped when the kiosk's building belongs to a property: the
    // cleaners of that property (by their own propertyId or their building's
    // property) appear, so a worker of another property can't identify here.
    // Unassigned workers (no property tie at all) are included too — they're
    // allowed on any kiosk online, so the offline roster must match. Falls back
    // to org-wide when the building has no property set.
    const cleaners = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] },
        ...(propertyId
          ? {
              OR: [
                { propertyId },
                { building: { propertyId } },
                { propertyId: null, buildingId: null },
                { propertyId: null, building: { propertyId: null } },
              ],
            }
          : {}),
      },
      select: {
        idNumber: true,
        name: true,
        arrivals: {
          where: { arrivedAt: { gte: todayStart }, leftAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });

    // Org-level admins manage everything (kept global); property managers are
    // scoped to the property they manage/belong to.
    const admins = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        OR: [
          { role: { in: ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'] } },
          propertyId
            ? { role: 'PROPERTY_MANAGER', OR: [{ propertyId }, { managedProperties: { some: { id: propertyId } } }] }
            : { role: 'PROPERTY_MANAGER' },
        ],
      },
      select: { idNumber: true, name: true },
    });

    return {
      cleaners: cleaners.map((c) => ({ idNumber: c.idNumber, name: c.name, checkedIn: c.arrivals.length > 0 })),
      admins: admins.map((a) => ({ idNumber: a.idNumber, name: a.name })),
    };
  }

  /**
   * Explains, in plain terms, whether a given worker may sign in on a given
   * kiosk and *why* — so a "he still gets in" report can be resolved without
   * guessing at the data. @Public, mirrors the kiosk endpoints' trust model.
   */
  async kioskAccessDiagnose(deviceCode: string, idNumber?: string) {
    const loc = await this.resolveKioskLocation(deviceCode);
    const result: any = {
      deviceCode,
      kioskResolved: !!loc,
      kioskOrgId: loc?.orgId ?? null,
      kioskPropertyId: loc?.propertyId ?? null,
    };
    if (!idNumber) return result;

    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber, role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] } },
      select: {
        name: true, isActive: true, role: true, propertyId: true, buildingId: true,
        building: { select: { name: true, propertyId: true } },
      },
    });
    if (!cleaner) { result.cleaner = { found: false }; return result; }

    const own = [cleaner.propertyId, cleaner.building?.propertyId].filter(Boolean) as string[];
    let verdict: string;
    if (!cleaner.isActive) verdict = 'BLOCKED_inactive';
    else if (!loc?.propertyId) verdict = 'ALLOWED_kiosk_building_has_no_property';
    else if (own.length === 0) verdict = 'ALLOWED_cleaner_not_assigned_to_any_property';
    else if (!own.includes(loc.propertyId)) verdict = 'BLOCKED_wrong_property';
    else verdict = 'ALLOWED_same_property';

    result.cleaner = {
      found: true,
      name: cleaner.name,
      isActive: cleaner.isActive,
      role: cleaner.role,
      cleanerPropertyId: cleaner.propertyId ?? null,
      buildingId: cleaner.buildingId ?? null,
      buildingName: cleaner.building?.name ?? null,
      buildingPropertyId: cleaner.building?.propertyId ?? null,
      verdict,
    };
    return result;
  }

  async checkin(dto: { cleanerIdNumber: string; restroomId?: string; buildingId?: string; note?: string }) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: dto.cleanerIdNumber, isActive: true, role: 'CLEANER' },
    });
    if (!cleaner) throw new Error('Cleaner not found');

    const arrival = await this.prisma.cleanerArrival.create({
      data: {
        userId: cleaner.id,
        restroomId: dto.restroomId ?? null,
        buildingId: dto.buildingId ?? cleaner.buildingId ?? null,
        note: dto.note ?? null,
      },
    });
    return { cleaner: { id: cleaner.id, name: cleaner.name }, arrivedAt: arrival.arrivedAt };
  }

  async checkout(cleanerIdNumber: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: cleanerIdNumber, isActive: true, role: 'CLEANER' },
    });
    if (!cleaner) throw new Error('Cleaner not found');

    // Find the latest open arrival (no leftAt) today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const arrival = await this.prisma.cleanerArrival.findFirst({
      where: { userId: cleaner.id, arrivedAt: { gte: todayStart }, leftAt: null },
      orderBy: { arrivedAt: 'desc' },
    });

    if (!arrival) {
      // No open shift — create a checkout-only record
      const rec = await this.prisma.cleanerArrival.create({
        data: { userId: cleaner.id, buildingId: cleaner.buildingId, arrivedAt: new Date(), leftAt: new Date() },
      });
      return { cleaner: { name: cleaner.name }, leftAt: rec.leftAt };
    }

    const updated = await this.prisma.cleanerArrival.update({
      where: { id: arrival.id },
      data: { leftAt: new Date() },
    });
    return { cleaner: { name: cleaner.name }, arrivedAt: updated.arrivedAt, leftAt: updated.leftAt };
  }

  async getActiveCleaners(orgId: string, propertyIds?: string[]) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return this.prisma.cleanerArrival.findMany({
      where: { user: { orgId, ...this.userPropertyFilter(propertyIds) }, arrivedAt: { gte: todayStart }, leftAt: null },
      include: { user: { select: { id: true, name: true, buildingId: true, building: { select: { name: true } } } } },
      orderBy: { arrivedAt: 'asc' },
    });
  }

  async getArrivals(orgId: string, from?: string, propertyIds?: string[]) {
    const where: any = { user: { orgId, ...this.userPropertyFilter(propertyIds) } };
    if (from) where.arrivedAt = { gte: new Date(from) };
    return this.prisma.cleanerArrival.findMany({
      where,
      include: { user: { select: { id: true, name: true, idNumber: true } } },
      orderBy: { arrivedAt: 'desc' },
      take: 100,
    });
  }

  async changePassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true, name: true, email: true },
    });
  }

  async updateAdmin(userId: string, patch: { name?: string; email?: string; idNumber?: string; preferredLang?: string }) {
    await this.assertIdNumberFree(userId, patch.idNumber);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name          !== undefined && { name: patch.name }),
        ...(patch.email         !== undefined && { email: patch.email }),
        ...(patch.idNumber      !== undefined && { idNumber: patch.idNumber }),
        ...(patch.preferredLang !== undefined && { preferredLang: patch.preferredLang }),
      },
      select: { id: true, name: true, email: true, idNumber: true, role: true, isActive: true, preferredLang: true },
    });
  }

  async updateWorker(userId: string, patch: { name?: string; idNumber?: string; phone?: string }) {
    await this.assertIdNumberFree(userId, patch.idNumber);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.idNumber !== undefined && { idNumber: patch.idNumber }),
        ...(patch.phone !== undefined && { phone: patch.phone }),
      },
      select: { id: true, name: true, idNumber: true, phone: true },
    });
  }

  async assignBuilding(userId: string, buildingId: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { buildingId },
      select: { id: true, name: true, buildingId: true, building: { select: { id: true, name: true } } },
    });
  }

  async toggleActive(userId: string, isActive: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });
  }

  async deleteUser(userId: string) {
    await this.prisma.incidentAction.updateMany({ where: { userId }, data: { userId: null } });
    await this.prisma.incident.updateMany({ where: { assignedCleanerId: userId }, data: { assignedCleanerId: null } });
    return this.prisma.user.delete({ where: { id: userId } });
  }

  async getMismatches(orgId: string, propertyIds?: string[]) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const s = (org?.settings ?? {}) as any;
    const thresholdMinutes = s.mismatchThresholdMinutes ?? 10;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const activeArrivals = await this.prisma.cleanerArrival.findMany({
      where: {
        user: { orgId, ...this.userPropertyFilter(propertyIds) },
        arrivedAt: { gte: todayStart, lte: cutoff },
        leftAt: null,
      },
      include: { user: { select: { id: true, name: true, idNumber: true, buildingId: true, building: { select: { name: true } } } } },
      orderBy: { arrivedAt: 'asc' },
    });

    const mismatches: any[] = [];
    for (const arrival of activeArrivals) {
      const actionCount = await this.prisma.incidentAction.count({
        where: {
          userId: arrival.user.id,
          actionType: { in: ['ACKNOWLEDGED', 'RESOLVED'] },
          performedAt: { gte: arrival.arrivedAt },
        },
      });
      if (actionCount === 0) {
        const minutesSinceArrival = Math.floor((Date.now() - arrival.arrivedAt.getTime()) / 60000);
        mismatches.push({
          arrivalId: arrival.id,
          arrivedAt: arrival.arrivedAt,
          minutesSinceArrival,
          user: arrival.user,
        });
      }
    }
    return mismatches;
  }

  async getEscalationConfig(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const s = (org?.settings ?? {}) as any;
    return {
      escalationEnabled: s.escalationEnabled ?? true,
      cleanerReminderMinutes: s.cleanerReminderMinutes ?? 5,
      supervisorEscalationMinutes: s.supervisorEscalationMinutes ?? 10,
      mismatchThresholdMinutes: s.mismatchThresholdMinutes ?? 10,
    };
  }

  async updateEscalationConfig(orgId: string, patch: {
    escalationEnabled?: boolean;
    cleanerReminderMinutes?: number;
    supervisorEscalationMinutes?: number;
    mismatchThresholdMinutes?: number;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const current = (org?.settings ?? {}) as any;
    const updated = { ...current, ...patch };
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: updated } });
    return {
      escalationEnabled: updated.escalationEnabled ?? true,
      cleanerReminderMinutes: updated.cleanerReminderMinutes ?? 5,
      supervisorEscalationMinutes: updated.supervisorEscalationMinutes ?? 10,
      mismatchThresholdMinutes: updated.mismatchThresholdMinutes ?? 10,
    };
  }
}
