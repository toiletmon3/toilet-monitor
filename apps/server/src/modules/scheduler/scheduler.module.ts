import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { EventsModule } from '../events/events.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [EventsModule, PushModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
