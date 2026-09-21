import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GENDERS } from './patients.types.js';
import type { Gender } from './patients.types.js';

export type PatientDocument = HydratedDocument<PatientEntity>;

@Schema({ collection: 'patients', timestamps: true, _id: false })
export class PatientEntity {
  /** Readable id, e.g. "PAT001" (plan section 9). */
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  name!: string;

  /** Optional: never invent an age the patient did not give (plan section 42). */
  @Prop()
  age?: number;

  @Prop({ required: true, type: String, enum: GENDERS, default: 'unknown' })
  gender!: Gender;

  @Prop({ index: true })
  phone?: string;
}

export const PatientSchema = SchemaFactory.createForClass(PatientEntity);
