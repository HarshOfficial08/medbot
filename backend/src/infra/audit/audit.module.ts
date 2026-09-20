import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './audit.schema.js';
import { AuditService } from './audit.service.js';

/**
 * @Global because every module needs to write audit rows; per CLAUDE.md
 * this is infrastructure, the narrow exception, not a precedent for
 * feature modules.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
