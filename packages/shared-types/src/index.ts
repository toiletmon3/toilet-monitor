// =============================================
// SHARED TYPES - used by both frontend and backend
// =============================================

// --- Enums ---

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  MANAGER = 'MANAGER',
  CLEANER = 'CLEANER',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  UNISEX = 'UNISEX',
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

export enum ActionType {
  REPORTED = 'REPORTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export enum DeviceType {
  KIOSK = 'KIOSK',
  SENSOR = 'SENSOR',
}

// --- Entities ---

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: OrganizationSettings;
  createdAt: string;
}

export interface OrganizationSettings {
  defaultLanguage: 'he' | 'en';
  rateLimit: number; // seconds between reports per issue type per device
  autoResolveAfterHours: number;
  logoUrl?: string;
  primaryColor?: string;
}

export interface Building {
  id: string;
  orgId: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  floors?: Floor[];
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  restrooms?: Restroom[];
}

export interface Restroom {
  id: string;
  floorId: string;
  name: string;
  gender: Gender;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  devices?: Device[];
}

export interface Device {
  id: string;
  restroomId: string;
  deviceCode: string;
  type: DeviceType;
  lastHeartbeat?: string;
  isOnline: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  idNumber: string;
  name: string;
  phone?: string;
  role: UserRole;
  preferredLang: 'he' | 'en';
  isActive: boolean;
  createdAt: string;
}

export interface IssueType {
  id: string;
  orgId?: string; // null = global default
  code: string;
  nameI18n: Record<string, string>; // { he: '...', en: '...' }
  icon: string; // emoji or icon name
  priority: number; // 1=highest
  isActive: boolean;
}

export interface Incident {
  id: string;
  restroomId: string;
  issueTypeId: string;
  deviceId: string;
  status: IncidentStatus;
  reportedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  actions?: IncidentAction[];
  // Joined data
  restroom?: Restroom & { floor: Floor & { building: Building } };
  issueType?: IssueType;
  assignedCleaner?: User;
}

export interface IncidentAction {
  id: string;
  incidentId: string;
  userId?: string;
  actionType: ActionType;
  notes?: string;
  performedAt: string;
  user?: Pick<User, 'id' | 'name' | 'idNumber'>;
}

// --- API Payloads ---

export interface CreateIncidentDto {
  restroomId: string;
  issueTypeId: string;
  deviceId: string;
  reportedAt: string; // device timestamp for accurate offline sync
  clientId: string; // UUID generated on device to prevent duplicates
}

export interface ResolveIncidentDto {
  cleanerIdNumber: string;
  notes?: string;
  performedAt: string; // device timestamp
}

export interface LoginDto {
  email?: string;
  idNumber?: string;
  password?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface SyncBatchDto {
  deviceId: string;
  incidents: CreateIncidentDto[];
  actions: OfflineAction[];
}

export interface OfflineAction {
  clientId: string;
  incidentClientId: string;
  actionType: ActionType;
  cleanerIdNumber?: string;
  notes?: string;
  performedAt: string;
}

export interface SyncBatchResponse {
  synced: number;
  failed: number;
  errors?: string[];
}

// --- Analytics ---

export interface AnalyticsSummary {
  totalIncidents: number;
  resolvedIncidents: number;
  avgResolutionMinutes: number;
  openIncidents: number;
  activeCleaners: number;
  onlineDevices: number;
}

export interface IssueFrequency {
  issueTypeCode: string;
  issueTypeName: string;
  count: number;
  avgResolutionMinutes: number;
}

export interface HourlyStats {
  hour: number;
  count: number;
}

// --- WebSocket Events ---

export const WS_EVENTS = {
  // Server -> Client
  INCIDENT_CREATED: 'incident:created',
  INCIDENT_UPDATED: 'incident:updated',
  INCIDENT_RESOLVED: 'incident:resolved',
  DEVICE_OFFLINE: 'device:offline',
  DEVICE_ONLINE: 'device:online',
  // Client -> Server
  DEVICE_HEARTBEAT: 'device:heartbeat',
  JOIN_ORG: 'join:org',
  JOIN_RESTROOM: 'join:restroom',
} as const;
