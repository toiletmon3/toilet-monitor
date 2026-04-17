import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BuildingsService {
  constructor(private prisma: PrismaService) {}

  async getOrgStructure(orgId: string) {
    return this.prisma.building.findMany({
      where: { orgId },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            restrooms: {
              include: {
                devices: { select: { id: true, deviceCode: true, isOnline: true, lastHeartbeat: true } },
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
