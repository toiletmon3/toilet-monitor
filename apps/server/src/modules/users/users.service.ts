import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getOrgSettings(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const s = (org?.settings ?? {}) as any;
    return {
      kioskLang: s.kioskLang ?? s.defaultLanguage ?? 'he',
      cleanerLang: s.cleanerLang ?? null,
      kioskTheme: s.kioskTheme ?? 'default',
      timezone: s.timezone ?? 'Asia/Jerusalem',
      dailyReportHour: s.dailyReportHour ?? 7,
      dailyReportEnabled: s.dailyReportEnabled ?? true,
    };
  }

  async updateOrgSettings(orgId: string, patch: { kioskLang?: string; cleanerLang?: string | null; kioskTheme?: string; timezone?: string; dailyReportHour?: number; dailyReportEnabled?: boolean }) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const current = (org?.settings ?? {}) as any;
    const updated = { ...current, ...patch };
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: updated } });
    return {
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

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true, name: true, email: true, idNumber: true,
        role: true, phone: true, preferredLang: true, isActive: true, createdAt: true,
        buildingId: true,
        building: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCleaner(orgId: string, dto: { name: string; idNumber: string; phone?: string; preferredLang?: string }) {
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
      },
      select: { id: true, name: true, idNumber: true, role: true, isActive: true },
    });
  }

  async createAdmin(orgId: string, dto: { name: string; email: string; password: string; role?: string }) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        orgId,
        name: dto.name,
        email: dto.email,
        idNumber: dto.email,
        passwordHash,
        role: (dto.role as any) ?? 'MANAGER',
      },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async verifyCleaner(idNumber: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber, role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] } },
      select: { id: true, name: true, isActive: true, role: true },
    });
    if (!cleaner) return { found: false };
    if (!cleaner.isActive) return { found: false, inactive: true };
    return { found: true, name: cleaner.name, role: cleaner.role };
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

  async getActiveCleaners(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return this.prisma.cleanerArrival.findMany({
      where: { user: { orgId }, arrivedAt: { gte: todayStart }, leftAt: null },
      include: { user: { select: { id: true, name: true, buildingId: true, building: { select: { name: true } } } } },
      orderBy: { arrivedAt: 'asc' },
    });
  }

  async getArrivals(orgId: string, from?: string) {
    const where: any = { user: { orgId } };
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

  async updateAdmin(userId: string, patch: { name?: string; email?: string; idNumber?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name     !== undefined && { name: patch.name }),
        ...(patch.email    !== undefined && { email: patch.email }),
        ...(patch.idNumber !== undefined && { idNumber: patch.idNumber }),
      },
      select: { id: true, name: true, email: true, idNumber: true, role: true, isActive: true },
    });
  }

  async updateWorker(userId: string, patch: { name?: string; idNumber?: string; phone?: string }) {
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

  async getMismatches(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const s = (org?.settings ?? {}) as any;
    const thresholdMinutes = s.mismatchThresholdMinutes ?? 10;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const activeArrivals = await this.prisma.cleanerArrival.findMany({
      where: {
        user: { orgId },
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
      escalationLevels: s.escalationLevels ?? [5, 10, 15],
      mismatchThresholdMinutes: s.mismatchThresholdMinutes ?? 10,
    };
  }

  async updateEscalationConfig(orgId: string, patch: { escalationEnabled?: boolean; escalationLevels?: number[]; mismatchThresholdMinutes?: number }) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const current = (org?.settings ?? {}) as any;
    const updated = { ...current, ...patch };
    await this.prisma.organization.update({ where: { id: orgId }, data: { settings: updated } });
    return {
      escalationEnabled: updated.escalationEnabled ?? true,
      escalationLevels: updated.escalationLevels ?? [5, 10, 15],
      mismatchThresholdMinutes: updated.mismatchThresholdMinutes ?? 10,
    };
  }
}
