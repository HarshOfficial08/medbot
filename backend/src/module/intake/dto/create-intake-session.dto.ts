import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CreateIntakeSessionDto {
  @ApiProperty({
    description: 'Identifier of the voice session to open intake for. Creating twice with the same id is idempotent.',
    example: 'SESSION-4f9c1b',
    pattern: '^[A-Za-z0-9._:-]{1,128}$',
  })
  @Matches(/^[A-Za-z0-9._:-]{1,128}$/, {
    message: 'sessionId must be 1-128 characters of A-Z, a-z, 0-9, dot, underscore, colon or hyphen',
  })
  sessionId!: string;
}
