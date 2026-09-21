import { ApiProperty } from '@nestjs/swagger';
import { DOCTOR_STATUSES } from '../doctors.types.js';
import type { Doctor, DoctorStatus } from '../doctors.types.js';

/**
 * The response shape for a doctor.
 *
 * A class rather than the `Doctor` interface because the OpenAPI spec is
 * generated from runtime metadata — an interface is erased and the
 * frontend's generated client would silently lose type fidelity
 * (CLAUDE.md, Global setup). `implements Doctor` keeps it locked to the
 * module contract: if `Doctor` changes, this stops compiling.
 */
export class DoctorDto implements Doctor {
  @ApiProperty({ description: 'Readable doctor id.', example: 'DOC001' })
  id!: string;

  @ApiProperty({ example: 'Dr. Asha Menon' })
  name!: string;

  @ApiProperty({
    description: 'Id of the department this doctor belongs to.',
    example: 'DENTAL',
  })
  departmentId!: string;

  @ApiProperty({ example: 'Endodontics' })
  specialization!: string;

  @ApiProperty({
    description: 'Only ACTIVE doctors may be offered appointment slots.',
    enum: DOCTOR_STATUSES,
    example: 'ACTIVE',
  })
  status!: DoctorStatus;
}
