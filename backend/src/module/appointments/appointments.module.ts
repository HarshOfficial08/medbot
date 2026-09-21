import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentEntity, AppointmentSchema } from './appointments.schema.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentsController } from './appointments.controller.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { SchedulesModule } from '../schedules/schedules.module.js';

/**
 * Owns appointments *and* availability: availability is
 * schedule − booked − doctor status, and booking has to re-run the same
 * computation immediately before committing (plan section 15), so the two
 * cannot live in different modules without duplicating the rule.
 *
 * Reads doctors and schedules through their exported services — never
 * their models (CLAUDE.md, Architecture rules 1 and 2).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppointmentEntity.name, schema: AppointmentSchema },
    ]),
    DoctorsModule,
    SchedulesModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
