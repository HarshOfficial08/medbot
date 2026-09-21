import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GENDERS } from '../patients.types.js';
import type { Gender } from '../patients.types.js';

/**
 * A new patient record.
 *
 * `age` and `phone` are optional on purpose and are *not* defaulted: if
 * the patient never gave one, the field stays absent rather than being
 * filled with a guess (plan section 42, "never invent missing
 * information"). Only `gender` has a default, and it is the contract's
 * explicit "unknown" marker — not an inference.
 */
export class CreatePatientDto {
  @ApiProperty({ description: 'Full name as the patient gave it.', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 130, example: 34 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  age?: number;

  @ApiPropertyOptional({ enum: [...GENDERS], default: 'unknown' })
  @IsOptional()
  @IsIn([...GENDERS])
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Contact number, digits with optional +, spaces or separators.',
    example: '+1 555 0134',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9][0-9\s().-]{5,19}$/, {
    message: 'phone must be a valid contact number',
  })
  phone?: string;
}
