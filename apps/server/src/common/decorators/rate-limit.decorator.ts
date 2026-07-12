import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Max requests allowed per IP within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

/**
 * Cap how often a single client IP may hit a route. Enforced by RateLimitGuard.
 * Used on brute-force-prone endpoints (login / ID verification) so an attacker
 * cannot try unlimited credentials. Example: @RateLimit({ limit: 20, windowMs: 5*60*1000 }).
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
