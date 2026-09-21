import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { INTAKE_STATUSES } from './intake.types.js';
import type {
  AppointmentPreference,
  IntakeFields,
  IntakeStatus,
  TranscriptTurn,
} from './intake.types.js';

export type IntakeSessionDocument = HydratedDocument<IntakeSessionEntity>;

/**
 * NOTE (plan section 54): this collection holds the patient's own words
 * and symptoms. Once real PHI is in scope it is protected health
 * information — never ship it to a service without a BAA.
 */
@Schema({ collection: 'intake_sessions', timestamps: true })
export class IntakeSessionEntity {
  @Prop({ required: true, unique: true })
  sessionId!: string;

  @Prop()
  patientId?: string;

  @Prop()
  intent?: string;

  @Prop()
  departmentId?: string;

  @Prop({ type: Object, default: {} })
  fields!: IntakeFields;

  @Prop({ type: Object, default: {} })
  preference!: AppointmentPreference;

  @Prop({ required: true, type: String, enum: INTAKE_STATUSES, default: 'collecting_information' })
  status!: IntakeStatus;

  @Prop({ type: Array, default: [] })
  transcript!: TranscriptTurn[];
}

export const IntakeSessionSchema = SchemaFactory.createForClass(IntakeSessionEntity);
