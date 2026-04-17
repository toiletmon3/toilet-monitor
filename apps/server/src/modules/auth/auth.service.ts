import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async loginAdmin(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true, role: { in: ['ORG_ADMIN', 'MANAGER', 'SUPER_ADMIN'] } },
      include: { organization: true },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user);
  }

  async loginCleaner(orgId: string | undefined, idNumber: string) {
    const where: any = { idNumber, isActive: true, role: 'CLEANER' };
    if (orgId) where.orgId = orgId;

    const user = await this.prisma.user.findFirst({
      where,
      include: { organization: true, building: true },
    });
    if (!user) throw new UnauthorizedException('Cleaner not found');

    const tokens = this.generateTokens(user);
    const orgSettings = (user.organization?.settings ?? {}) as any;
    // cleanerLang from org overrides individual, null means use user's preferredLang
    const effectiveLang = orgSettings.cleanerLang ?? user.preferredLang ?? 'he';
    return { ...tokens, effectiveLang };
  }

  async getAdminBypassToken() {
    const admin = await this.prisma.user.findFirst({
      where: { role: { in: ['ORG_ADMIN', 'SUPER_ADMIN', 'MANAGER'] }, isActive: true },
      include: { organization: true, building: true },
    });
    if (!admin) return null;
    return this.generateTokens(admin);
  }

  async getDefaultOrg() {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) return null;
    const s = (org.settings ?? {}) as any;
    return {
      orgId: org.id,
      orgName: org.name,
      kioskLang: s.kioskLang ?? s.defaultLanguage ?? 'he',
      cleanerLang: s.cleanerLang ?? null,
    };
  }

  async validateKioskDevice(deviceCode: string) {
    let device = await this.prisma.device.findUnique({
      where: { deviceCode },
      include: {
        restroom: {
          include: {
            floor: { include: { building: { include: { organization: true } } } },
          },
        },
      },
    });

    // Auto-create device for selector-based kiosks (ROOM-{restroomId})
    if (!device && deviceCode.startsWith('ROOM-')) {
      const restroomId = deviceCode.slice(5);
      const restroom = await this.prisma.restroom.findUnique({
        where: { id: restroomId },
        include: { floor: { include: { building: { include: { organization: true } } } } },
      });
      if (!restroom) throw new UnauthorizedException('Restroom not found');

      device = await this.prisma.device.upsert({
        where: { deviceCode },
        create: { deviceCode, restroomId, type: 'KIOSK' },
        update: {},
        include: {
          restroom: {
            include: {
              floor: { include: { building: { include: { organization: true } } } },
            },
          },
        },
      });
    }

    if (!device) throw new UnauthorizedException('Device not registered');
    return device;
  }

  private generateTokens(user: any) {
    const payload = { sub: user.id, orgId: user.orgId, role: user.role, buildingId: user.buildingId ?? null };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        idNumber: user.idNumber,
        role: user.role,
        preferredLang: user.preferredLang,
        orgId: user.orgId,
        buildingId: user.buildingId ?? null,
        buildingName: user.building?.name ?? null,
      },
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
