import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DOCTOR_STATUSES } from './doctors.types.js';
import type { DoctorStatus } from './doctors.types.js';

export type DoctorDocument = HydratedDocument<DoctorEntity>;

@Schema({ collection: 'doctors', timestamps: true, _id: false })
export class DoctorEntity {
  /** Readable id, e.g. "DOC001" (plan section 9). */
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  name!: string;

  /** References departments._id. A foreign key, not a populated model —
   *  doctors must never import the departments schema. */
  @Prop({ required: true, index: true })
  departmentId!: string;

  @Prop({ required: true })
  specialization!: string;

  @Prop({ required: true, type: String, enum: DOCTOR_STATUSES, default: 'ACTIVE' })
  status!: DoctorStatus;
}

export const DoctorSchema = SchemaFactory.createForClass(DoctorEntity);

// The agent's hot path: "find bookable doctors in this department".
DoctorSchema.index({ departmentId: 1, status: 1 });
