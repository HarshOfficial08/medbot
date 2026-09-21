import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { APPOINTMENT_STATUSES } from './appointments.types.js';
import type { AppointmentStatus } from './appointments.types.js';

export type AppointmentDocument = HydratedDocument<AppointmentEntity>;

@Schema({ collection: 'appointments', timestamps: true })
export class AppointmentEntity {
  @Prop({ required: true, index: true })
  patientId!: string;

  @Prop({ required: true, index: true })
  doctorId!: string;

  /** ISO date "2026-09-21", clinic-local. */
  @Prop({ required: true })
  date!: string;

  /** "HH:mm". */
  @Prop({ required: true })
  startTime!: string;

  @Prop({ required: true })
  endTime!: string;

  @Prop({ required: true, type: String, enum: APPOINTMENT_STATUSES })
  status!: AppointmentStatus;

  /** Set on COMMIT actions so a retry cannot double-book. */
  @Prop()
  idempotencyKey?: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(AppointmentEntity);

/**
 * The double-booking guard.
 *
 * Partial unique index: only statuses that actually occupy the slot are
 * constrained, so a cancelled appointment frees its time rather than
 * blocking it forever. Two concurrent bookings for one slot means one
 * insert wins and the other gets a duplicate-key error — enforced by the
 * database, not by a read-then-write race in application code.
 */
AppointmentSchema.index(
  { doctorId: 1, date: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['HELD', 'PROPOSED', 'CONFIRMED'] },
    },
  },
);

// Retries of the same COMMIT resolve to the same appointment.
AppointmentSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true },
);

// The doctor dashboard's main query: "my patients today".
AppointmentSchema.index({ doctorId: 1, date: 1 });
