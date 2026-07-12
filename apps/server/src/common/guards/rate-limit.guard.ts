import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

/**
 * In-memory per-IP sliding-window rate limiter. Registered globally but only
 * acts on routes decorated with @RateLimit(...). No external dependency /
 * lockfile change, and the production server is a single PM2 process, so an
 * in-memory window is sufficient (per-instance protection even if scaled out).
 *
 * Runs BEFORE JwtAuthGuard so a flood is rejected with 429 before any expensive
 * work (e.g. bcrypt on the login route).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const req = context.switchToHttp().getRequest();
    const now = Date.now();
    this.sweep(now);

    const fwd = req.headers?.['x-forwarded-for'];
    const ip =
      (typeof fwd === 'string' && fwd.split(',')[0]?.trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${ip}|${context.getClass().name}.${context.getHandler().name}`;

    const windowStart = now - opts.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= opts.limit) {
      const retryMs = recent[0] + opts.windowMs - now;
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Please try again later.',
          retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drop empty/expired buckets at most once a minute to bound memory. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      // Keep only buckets touched in the last 10 minutes.
      if (times.length === 0 || times[times.length - 1] < now - 10 * 60_000) {
        this.hits.delete(key);
      }
    }
  }
}
