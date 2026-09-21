import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntakeService } from './intake.service.js';
import { AppendTranscriptDto } from './dto/append-transcript.dto.js';
import { CreateIntakeSessionDto } from './dto/create-intake-session.dto.js';
import { IntakeCompletenessResponseDto } from './dto/intake-completeness.response.dto.js';
import { IntakeSessionResponseDto } from './dto/intake-session.response.dto.js';
import { SessionIdParamDto } from './dto/session-id.param.dto.js';
import { UpdateIntakeDto } from './dto/update-intake.dto.js';
import type { IntakeCompleteness, IntakeSession } from './intake.types.js';

/** Routing only — every rule about intake state lives in IntakeService. */
@ApiTags('intake')
@Controller('intake')
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Post()
  // 200, not 201: the call is idempotent, so it just as often returns the
  // session that already existed as creates one.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open an intake session',
    description: 'Idempotent: calling twice with the same sessionId returns the existing session.',
  })
  @ApiOkResponse({ type: IntakeSessionResponseDto })
  async create(@Body() body: CreateIntakeSessionDto): Promise<IntakeSession> {
    return await this.intakeService.createSession(body.sessionId);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Read one intake session' })
  @ApiOkResponse({ type: IntakeSessionResponseDto })
  @ApiNotFoundResponse({ description: 'No intake session with that id.' })
  async findOne(@Param() params: SessionIdParamDto): Promise<IntakeSession> {
    return await this.intakeService.findBySessionId(params.sessionId);
  }

  /**
   * Apply whatever the agent has newly learned. Each part merges, so a
   * request carrying only `severity` leaves every other collected answer
   * untouched.
   */
  @Patch(':sessionId')
  @ApiOperation({ summary: 'Merge newly-learned intake state into a session' })
  @ApiOkResponse({ type: IntakeSessionResponseDto })
  @ApiBadRequestResponse({ description: 'Empty body, or a field value of an unsupported type.' })
  @ApiNotFoundResponse({ description: 'No intake session with that id.' })
  async update(
    @Param() params: SessionIdParamDto,
    @Body() body: UpdateIntakeDto,
  ): Promise<IntakeSession> {
    const { sessionId } = params;
    const { fields, departmentId, preference, status } = body;

    if (!fields && departmentId === undefined && !preference && status === undefined) {
      // An empty PATCH is a caller bug worth surfacing, not a silent no-op.
      throw new BadRequestException(
        'Provide at least one of: fields, departmentId, preference, status',
      );
    }

    // Read-back order matters only in that the final call returns the
    // fully-updated session.
    if (departmentId !== undefined) {
      await this.intakeService.setDepartment(sessionId, departmentId);
    }
    if (fields) {
      await this.intakeService.updateFields(sessionId, fields);
    }
    if (preference) {
      await this.intakeService.setPreference(sessionId, preference);
    }
    if (status !== undefined) {
      await this.intakeService.setStatus(sessionId, status);
    }

    return await this.intakeService.findBySessionId(sessionId);
  }

  @Post(':sessionId/transcript')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Append one conversation turn' })
  @ApiOkResponse({ type: IntakeSessionResponseDto })
  @ApiNotFoundResponse({ description: 'No intake session with that id.' })
  async appendTranscript(
    @Param() params: SessionIdParamDto,
    @Body() body: AppendTranscriptDto,
  ): Promise<IntakeSession> {
    return await this.intakeService.appendTranscript(params.sessionId, {
      speaker: body.speaker,
      text: body.text,
      // A server timestamp when the caller gave none: this is a system
      // clock reading, not a clinical value being guessed at.
      at: body.at ?? new Date(),
    });
  }

  @Get(':sessionId/completeness')
  @ApiOperation({
    summary: 'Which required fields are still missing',
    description: 'Lets the agent ask the next useful question instead of running a fixed questionnaire.',
  })
  @ApiOkResponse({ type: IntakeCompletenessResponseDto })
  @ApiNotFoundResponse({ description: 'No intake session with that id.' })
  async completeness(@Param() params: SessionIdParamDto): Promise<IntakeCompleteness> {
    return await this.intakeService.getCompleteness(params.sessionId);
  }
}
