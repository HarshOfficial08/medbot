import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepartmentEntity, DepartmentSchema } from './departments.schema.js';
import { DepartmentsService } from './departments.service.js';
import { DepartmentsController } from './departments.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DepartmentEntity.name, schema: DepartmentSchema }]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  // Exported so other modules can read through this service rather than
  // touching its collection (CLAUDE.md, Architecture rules 1 and 2).
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
