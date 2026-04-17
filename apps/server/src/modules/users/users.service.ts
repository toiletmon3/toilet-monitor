import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
}
