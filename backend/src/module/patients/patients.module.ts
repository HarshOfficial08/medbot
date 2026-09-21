import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientEntity, PatientSchema } from './patients.schema.js';
import { PatientsService } from './patients.service.js';
import { PatientsController } from './patients.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PatientEntity.name, schema: PatientSchema }]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  // Exported so other modules can read through this service rather than
  // touching its collection (CLAUDE.md, Architecture rules 1 and 2).
  exports: [PatientsService],
})
export class PatientsModule {}
