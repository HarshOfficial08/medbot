import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleEntity, ScheduleSchema } from './schedules.schema.js';
import { SchedulesService } from './schedules.service.js';
import { SchedulesController } from './schedules.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ScheduleEntity.name, schema: ScheduleSchema }]),
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  // Exported so other modules can read through this service rather than
  // touching its collection (CLAUDE.md, Architecture rules 1 and 2).
  exports: [SchedulesService],
})
export class SchedulesModule {}
