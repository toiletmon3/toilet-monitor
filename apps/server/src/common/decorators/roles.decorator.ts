import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Roles allowed to reach admin/staff-management surfaces. */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER'] as const;

/** Admins plus property managers (scoped to their own properties elsewhere). */
export const ADMIN_PM_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'PROPERTY_MANAGER'] as const;

/** Every authenticated staff role — use to exempt a single route from a
 *  stricter controller-level @Roles (i.e. "any logged-in user"). */
export const ALL_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER', 'PROPERTY_MANAGER', 'SHIFT_SUPERVISOR', 'CLEANER'] as const;

/**
 * Restrict a route (or a whole controller) to the given roles. Enforced by
 * RolesGuard, which runs after JwtAuthGuard and reads the DB-verified user.role.
 * Routes marked @Public() are skipped (they carry no authenticated user).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
