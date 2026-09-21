import { PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto.js';

/**
 * Every field optional, validators and OpenAPI metadata inherited.
 *
 * `PartialType` comes from `@nestjs/swagger` rather than
 * `@nestjs/mapped-types` so the generated spec keeps the property
 * documentation the frontend client is generated from.
 *
 * Fields left out are left alone — this never clears a stored value.
 */
export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
