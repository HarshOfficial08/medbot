import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** What the agent reads to decide which question to ask next. */
export class IntakeCompletenessResponseDto {
  @ApiProperty({ example: 'SESSION-4f9c1b' })
  sessionId!: string;

  @ApiPropertyOptional({ example: 'DENTAL' })
  departmentId?: string;

  @ApiProperty({
    description:
      'False when no department is chosen yet, or when the chosen one has no DOMAIN_CONFIG entry — in both cases an empty missing-list means "unknown", not "done".',
  })
  departmentConfigured!: boolean;

  @ApiProperty({ type: [String], example: ['complaint', 'duration', 'location'] })
  requiredFields!: string[];

  @ApiProperty({ type: [String] })
  optionalFields!: string[];

  @ApiProperty({ type: [String], description: 'Required fields still unanswered.', example: ['location'] })
  missingRequiredFields!: string[];

  @ApiProperty({ description: 'True only when a configured department is chosen and nothing required is missing.' })
  complete!: boolean;
}
