import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      // Fail closed: never fall back to a hardcoded/guessable secret, which would
      // let anyone forge admin tokens. Refuse to start the auth strategy instead.
      throw new Error('JWT_SECRET is not set — refusing to start');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; orgId: string; role: string }) {
    // buildingId is read from the DB (not the token) so admin-side assignment
    // changes take effect on the next request without forcing a re-login.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, orgId: true, role: true, name: true, isActive: true, buildingId: true, propertyId: true,
        managedProperties: { select: { id: true } },
      },
    });
    if (!user || !user.isActive) return null;
    const { managedProperties, ...rest } = user;
    return { ...rest, propertyIds: managedProperties.map(p => p.id) };
  }
}
