import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
