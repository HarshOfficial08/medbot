import { ApiProperty } from '@nestjs/swagger';
import type { Department } from '../departments.types.js';

/**
 * The wire shape of a department.
 *
 * Exists so the OpenAPI spec carries a real schema — the frontend's
 * typed client is generated from it, and a route documented only as
 * `object` silently degrades that client (CLAUDE.md, Global setup).
 * It mirrors the `Department` contract exactly; `implements` keeps the
 * two from drifting apart.
 */
export class DepartmentResponseDto implements Department {
  @ApiProperty({
    description: 'Readable identifier, also the primary key.',
    example: 'DENTAL',
  })
  id!: string;

  @ApiProperty({ example: 'Dental' })
  name!: string;

  @ApiProperty({
    description: 'Whether the department is currently accepting patients.',
    example: true,
  })
  active!: boolean;
}
