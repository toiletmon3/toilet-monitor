import { IsString, IsArray, ArrayMaxSize, IsOptional, MaxLength } from 'class-validator';

export class CreateIncidentDto {
  @IsString() @MaxLength(100) restroomId!: string;
  @IsString() @MaxLength(100) issueTypeId!: string;
  @IsString() @MaxLength(100) deviceId!: string;
  @IsString() @MaxLength(40) reportedAt!: string;
  @IsString() @MaxLength(100) clientId!: string;
}

/**
 * Offline-queue flush. The array caps are the important control here: without
 * them this @Public() endpoint accepted an unbounded `any` body and iterated it
 * straight into the DB (a trivial flood/DoS lever). Inner items are validated
 * per-record inside create()/applyOfflineAction().
 */
export class SyncBatchDto {
  @IsOptional() @IsString() @MaxLength(100) deviceId?: string;

  @IsArray()
  @ArrayMaxSize(500)
  incidents!: Array<{ restroomId: string; issueTypeId: string; deviceId: string; reportedAt: string; clientId: string }>;

  @IsArray()
  @ArrayMaxSize(1000)
  actions!: Array<{ clientId?: string; incidentClientId: string; actionType: string; cleanerIdNumber?: string; notes?: string; performedAt: string }>;
}
