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

  async loginCleaner(orgId: string, idNumber: string) {
    const user = await this.prisma.user.findFirst({
      where: { orgId, idNumber, isActive: true, role: 'CLEANER' },
      include: { organization: true },
    });
    if (!user) throw new UnauthorizedException('Cleaner not found');

    return this.generateTokens(user);
  }

  async validateKioskDevice(deviceCode: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      include: {
        restroom: {
          include: {
            floor: { include: { building: { include: { organization: true } } } },
          },
        },
      },
    });
    if (!device) throw new UnauthorizedException('Device not registered');
    return device;
  }

  private generateTokens(user: any) {
    const payload = { sub: user.id, orgId: user.orgId, role: user.role };
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
