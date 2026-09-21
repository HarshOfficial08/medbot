import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DepartmentDocument = HydratedDocument<DepartmentEntity>;

/**
 * Departments use a readable string _id ("DENTAL") rather than an
 * ObjectId, per plan section 9 — it makes seed data, logs, and the
 * agent's tool arguments legible.
 */
@Schema({ collection: 'departments', timestamps: true, _id: false })
export class DepartmentEntity {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, default: true })
  active!: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(DepartmentEntity);
