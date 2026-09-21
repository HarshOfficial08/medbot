import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Phone is required, not optional.
 *
 * `GET /patients` with no filter would dump the whole patient
 * collection, which is PHI (patients.types.ts, plan section 54). A
 * lookup needs something to look up; without it the global
 * ValidationPipe answers 400 rather than the API answering with
 * everyone's records.
 */
export class FindPatientsQueryDto {
  @ApiProperty({ description: 'Exact contact number to look up.', example: '+1 555 0134' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
