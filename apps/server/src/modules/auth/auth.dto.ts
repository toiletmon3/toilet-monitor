import { IsString, IsOptional, MaxLength } from 'class-validator';

// Loose (type-only) validation on purpose: these gate the login inputs so a
// non-string / oversized / extra-field payload can't reach bcrypt or the DB
// query, without rejecting valid credentials (e.g. non-email admin usernames).

export class AdminLoginDto {
  @IsString() @MaxLength(200) email!: string;
  @IsString() @MaxLength(200) password!: string;
}

export class CleanerLoginDto {
  @IsOptional() @IsString() @MaxLength(100) orgId?: string;
  @IsString() @MaxLength(100) idNumber!: string;
}

export class RefreshDto {
  @IsString() @MaxLength(4000) refreshToken!: string;
}
