import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { UsersModule } from './modules/users/users.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EventsModule } from './modules/events/events.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { PushModule } from './modules/push/push.module';
import { EmailModule } from './modules/email/email.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '/opt/toilet-monitor/.env.production',
        '.env.production',
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    BuildingsModule,
    IncidentsModule,
    UsersModule,
    AnalyticsModule,
    EventsModule,
    SchedulerModule,
    PushModule,
    EmailModule,
    SensorsModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard runs first and populates request.user,
    // then RolesGuard enforces @Roles() against the verified user.role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
