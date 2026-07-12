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
    const { name, ...settingsPatch } = patch;
    const updated = { ...current, ...settingsPatch };
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

  /** User "propertyId in ids" filter — direct assignment OR via the assigned building. */
  private userPropertyFilter(propertyIds?: string[]) {
    return propertyIds
      ? { OR: [{ propertyId: { in: propertyIds } }, { building: { propertyId: { in: propertyIds } } }] }
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
        role: true, phone: true, preferredLang: true, isActive: true, createdAt: true,
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
      select: { role: true, propertyId: true, building: { select: { propertyId: true } } },
    });
    if (!target) throw new ForbiddenException();
    const mine = requester.propertyIds ?? [];
    const isWorker = target.role === 'CLEANER' || target.role === 'SHIFT_SUPERVISOR';
    const inProperty =
      (!!target.propertyId && mine.includes(target.propertyId)) ||
      (!!target.building?.propertyId && mine.includes(target.building.propertyId));
    if (!isWorker || !inProperty) {
      throw new ForbiddenException('Property managers can only manage workers of their own properties');
    }
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

  async verifyCleaner(idNumber: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber, role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] } },
      select: { id: true, name: true, isActive: true, role: true },
    });
    if (!cleaner) return { found: false };
    if (!cleaner.isActive) return { found: false, inactive: true };
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
