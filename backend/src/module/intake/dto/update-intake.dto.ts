import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { INTAKE_STATUSES } from '../intake.types.js';
import type { IntakeFields, IntakeStatus } from '../intake.types.js';
import { IsIntakeFieldMap } from './intake-fields.validator.js';

export class AppointmentPreferenceDto {
  @ApiPropertyOptional({ description: 'Doctor the patient asked for, if any.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  preferredDoctorId?: string;

  @ApiPropertyOptional({ description: 'Preferred date, ISO (YYYY-MM-DD).', example: '2026-10-02' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'preferredDate must be an ISO date (YYYY-MM-DD)' })
  preferredDate?: string;

  @ApiPropertyOptional({
    description: 'Time preference as the patient said it ("evening", "after 6"); normalised downstream.',
    example: 'evening',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredTime?: string;

  @ApiPropertyOptional({ description: 'Earliest acceptable time, HH:mm.', example: '18:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'earliestTime must be HH:mm' })
  earliestTime?: string;

  @ApiPropertyOptional({ description: 'Latest acceptable time, HH:mm.', example: '20:30' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'latestTime must be HH:mm' })
  latestTime?: string;
}

/**
 * Everything the agent can revise on a live session. Every property is
 * optional and each one is applied as a *merge*: omitting a key leaves
 * whatever is stored alone, it never clears it. That is what lets the
 * agent report one newly-learned fact per turn without having to resend
 * (or re-guess) the rest.
 */
export class UpdateIntakeDto {
  @ApiPropertyOptional({
    description:
      'Newly-learned intake answers, merged into the stored ones. Only include what the patient actually said — a field that is absent stays absent.',
    type: 'object',
    additionalProperties: true,
    example: { complaint: 'tooth pain', duration: '3 days' },
  })
  @IsOptional()
  @IsObject()
  @IsIntakeFieldMap()
  fields?: IntakeFields;

  @ApiPropertyOptional({ description: 'Department code this session is being routed to.', example: 'DENTAL' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, {
    message: 'departmentId must be an uppercase department code, e.g. DENTAL',
  })
  departmentId?: string;

  @ApiPropertyOptional({ type: AppointmentPreferenceDto, description: 'Scheduling preferences, merged into the stored ones.' })
  @IsOptional()
  @ValidateNested()
  // Needed for the nested object to be validated as a class rather than a
  // plain literal — without it the global whitelist cannot see inside it.
  @Type(() => AppointmentPreferenceDto)
  preference?: AppointmentPreferenceDto;

  @ApiPropertyOptional({ enum: INTAKE_STATUSES, description: 'Where the session has reached in the intake state machine.' })
  @IsOptional()
  @IsIn([...INTAKE_STATUSES])
  status?: IntakeStatus;
}
