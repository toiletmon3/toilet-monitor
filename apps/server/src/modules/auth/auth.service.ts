import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async loginAdmin(email: string, password: string) {
    // Email/username login is case-insensitive: an admin typing "Ori@x.com"
    // or "ori@x.com" logs in regardless of how the value was stored. `equals`
    // with mode:'insensitive' compares case-insensitively on the DB side
    // (Postgres ILIKE), so it also covers mixed-case stored values. We trim
    // stray whitespace (common when pasting) first.
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
        isActive: true,
        role: { in: ['ORG_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'PROPERTY_MANAGER'] },
      },
      include: { organization: true },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user);
  }

  async loginCleaner(orgId: string | undefined, idNumber: string) {
    const baseWhere: any = { idNumber, role: { in: ['CLEANER', 'SHIFT_SUPERVISOR'] } };
    if (orgId) baseWhere.orgId = orgId;

    const anyUser = await this.prisma.user.findFirst({ where: baseWhere });
    if (!anyUser) throw new UnauthorizedException('NOT_FOUND');
    if (!anyUser.isActive) throw new UnauthorizedException('INACTIVE');

    const user = await this.prisma.user.findFirst({
      where: { ...baseWhere, isActive: true },
      include: { organization: true, building: true },
    });
    if (!user) throw new UnauthorizedException('NOT_FOUND');

    const tokens = await this.generateTokens(user);
    const orgSettings = (user.organization?.settings ?? {}) as any;
    const effectiveLang = orgSettings.cleanerLang ?? user.preferredLang ?? 'he';
    const effectiveTimezone = orgSettings.timezone ?? 'Asia/Jerusalem';
    return { ...tokens, effectiveLang, effectiveTimezone };
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
      kioskTheme: s.kioskTheme ?? 'default',
      timezone: s.timezone ?? 'Asia/Jerusalem',
    };
  }

  async validateKioskDevice(deviceCode: string) {
    // Codes deleted from the admin UI stay blocked — otherwise the public
    // ROOM-* auto-create below resurrects the device on the next page load.
    const blocked = await this.prisma.blockedDeviceCode.findUnique({ where: { deviceCode } });
    if (blocked) throw new UnauthorizedException('Device removed by admin');

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

  async reassignDevice(deviceCode: string, restroomId: string) {
    const restroom = await this.prisma.restroom.findUnique({
      where: { id: restroomId },
      include: { floor: { include: { building: { include: { organization: true } } } } },
    });
    if (!restroom) throw new NotFoundException('Restroom not found');

    // Deliberate re-registration through the kiosk selector (admin-verified)
    // lifts any block left by a previous deletion.
    await this.prisma.blockedDeviceCode.deleteMany({ where: { deviceCode } });

    const device = await this.prisma.device.upsert({
      where: { deviceCode },
      update: { restroomId },
      create: { deviceCode, restroomId, type: 'KIOSK' },
      include: {
        restroom: {
          include: { floor: { include: { building: true } } },
        },
      },
    });
    return { ok: true, deviceCode, restroomId, restroomName: restroom.name };
  }

  /** Fresh user profile from the DB — same shape as the login payload's `user`. */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { building: true, property: true, managedProperties: { select: { id: true, name: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      idNumber: user.idNumber,
      role: user.role,
      preferredLang: user.preferredLang,
      orgId: user.orgId,
      buildingId: user.buildingId ?? null,
      buildingName: user.building?.name ?? null,
      propertyId: user.propertyId ?? null,
      propertyName: user.property?.name ?? null,
      propertyIds: user.managedProperties.map(p => p.id),
      propertyNames: user.managedProperties.map(p => p.name),
    };
  }

  private async generateTokens(user: any) {
    const jti = randomUUID();
    const payload = { sub: user.id, orgId: user.orgId, role: user.role, buildingId: user.buildingId ?? null };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign({ ...payload, jti }, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    // Track this refresh session so it can be rotated on refresh and revoked on
    // logout. The stored expiry is only used for later cleanup — the JWT's own
    // exp is the authoritative lifetime.
    await this.prisma.refreshToken.create({
      data: { jti, userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
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
        propertyId: user.propertyId ?? null,
      },
    };
  }

  async refreshToken(token: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(token, { secret: this.config.get('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

    if (payload.jti) {
      // New-format token: it must still map to a live session. Deleting it here
      // ROTATES the session — a replayed (already-used) token then finds no row
      // and is rejected. deleteMany is atomic, so two concurrent refreshes with
      // the same jti can't both succeed.
      const { count } = await this.prisma.refreshToken.deleteMany({ where: { jti: payload.jti } });
      if (count === 0) throw new UnauthorizedException('Refresh token already used or revoked');
    }
    // Tokens issued before this change carry no jti — grandfather them once and
    // upgrade to a tracked, rotating session on this refresh.
    return this.generateTokens(user);
  }

  /** Revoke the presented refresh session (logout). No-op for an unknown/expired token. */
  async logout(token: string) {
    try {
      const payload: any = this.jwt.verify(token, { secret: this.config.get('JWT_REFRESH_SECRET') });
      if (payload?.jti) {
        await this.prisma.refreshToken.deleteMany({ where: { jti: payload.jti } });
      }
    } catch {
      // logging out with an invalid/expired token is a successful no-op
    }
    return { ok: true };
  }
}
