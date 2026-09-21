import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Route parameter for every per-session endpoint. */
export class SessionIdParamDto {
  @ApiProperty({
    description: 'Identifier of the voice session this intake belongs to.',
    example: 'SESSION-4f9c1b',
    pattern: '^[A-Za-z0-9._:-]{1,128}$',
  })
  // Bounded and character-restricted because it is used as a query
  // selector and lands in the audit trail.
  @Matches(/^[A-Za-z0-9._:-]{1,128}$/, {
    message: 'sessionId must be 1-128 characters of A-Z, a-z, 0-9, dot, underscore, colon or hyphen',
  })
  sessionId!: string;
}
