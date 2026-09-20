import { ApiProperty } from '@nestjs/swagger';

/**
 * The single error shape every failing request returns.
 *
 * Declared as a real DTO with @ApiProperty so it lands in the OpenAPI
 * spec — the frontend's generated client needs to know the error shape,
 * not just the success one (CLAUDE.md, Global setup).
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    description: 'Human-readable message, or field-level validation messages.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['name should not be empty'],
  })
  message!: string | string[];

  @ApiProperty({ example: '/doctors/DOC001' })
  path!: string;

  @ApiProperty({
    description: 'Correlation id — matches the x-request-id response header.',
    example: '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071',
  })
  requestId!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}
