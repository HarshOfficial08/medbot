import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GENDERS } from '../patients.types.js';
import type { Gender, Patient } from '../patients.types.js';

/**
 * The wire shape of a patient, mirroring the `Patient` contract —
 * `implements` keeps them from drifting.
 *
 * Absent `age`/`phone` are genuinely absent from the response body, not
 * null: the API never asserts a value the patient did not give.
 */
export class PatientResponseDto implements Patient {
  @ApiProperty({ description: 'Readable identifier, e.g. "PAT001".', example: 'PAT001' })
  id!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiPropertyOptional({ example: 34 })
  age?: number;

  @ApiProperty({ enum: [...GENDERS], example: 'female' })
  gender!: Gender;

  @ApiPropertyOptional({ example: '+1 555 0134' })
  phone?: string;
}
