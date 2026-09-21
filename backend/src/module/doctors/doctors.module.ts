import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorEntity, DoctorSchema } from './doctors.schema.js';
import { DoctorsService } from './doctors.service.js';
import { DoctorsController } from './doctors.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DoctorEntity.name, schema: DoctorSchema }]),
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  // Exported so other modules can read through this service rather than
  // touching its collection (CLAUDE.md, Architecture rules 1 and 2).
  exports: [DoctorsService],
})
export class DoctorsModule {}
