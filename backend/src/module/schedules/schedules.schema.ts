import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DAYS_OF_WEEK } from './schedules.types.js';
import type { DayOfWeek } from './schedules.types.js';

export type ScheduleDocument = HydratedDocument<ScheduleEntity>;

@Schema({ collection: 'schedules', timestamps: true })
export class ScheduleEntity {
  @Prop({ required: true, index: true })
  doctorId!: string;

  @Prop({ required: true, type: String, enum: DAYS_OF_WEEK })
  dayOfWeek!: DayOfWeek;

  /** "HH:mm" clinic-local — see schedules.types.ts for why not a Date. */
  @Prop({ required: true })
  startTime!: string;

  @Prop({ required: true })
  endTime!: string;

  @Prop({ required: true, default: 30 })
  slotDurationMinutes!: number;
}

export const ScheduleSchema = SchemaFactory.createForClass(ScheduleEntity);

// Availability lookup is always "this doctor, this weekday".
ScheduleSchema.index({ doctorId: 1, dayOfWeek: 1 });
