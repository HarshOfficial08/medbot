import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * One conversation turn. The `text` here is the patient's own words —
 * PHI. It is stored, never logged.
 */
export class AppendTranscriptDto {
  @ApiProperty({ enum: ['patient', 'agent'], description: 'Who spoke this turn.' })
  @IsIn(['patient', 'agent'])
  speaker!: 'patient' | 'agent';

  @ApiProperty({ description: 'What was said.', maxLength: 10000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  text!: string;

  @ApiPropertyOptional({
    description: 'When the turn happened. Defaults to the time the server received it.',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  at?: Date;
}
