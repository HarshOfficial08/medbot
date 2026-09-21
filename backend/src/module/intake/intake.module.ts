import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntakeSessionEntity, IntakeSessionSchema } from './intake.schema.js';
import { IntakeService } from './intake.service.js';
import { IntakeController } from './intake.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: IntakeSessionEntity.name, schema: IntakeSessionSchema }]),
  ],
  controllers: [IntakeController],
  providers: [IntakeService],
  // Exported so other modules can read through this service rather than
  // touching its collection (CLAUDE.md, Architecture rules 1 and 2).
  exports: [IntakeService],
})
export class IntakeModule {}
