import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service.js';
import type { Appointment, AvailableSlot } from './appointments.types.js';
import { AppointmentResponseDto } from './dto/appointment.response.dto.js';
import { AvailableSlotResponseDto } from './dto/available-slot.response.dto.js';
import { BookAppointmentDto } from './dto/book-appointment.dto.js';
import { FindSlotsQueryDto } from './dto/find-slots.query.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';

/** Routing only — every rule lives in AppointmentsService. */
@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /**
   * Declared before ':id' deliberately: route resolution is declaration
   * order unless `routeResolutionStrategy: 'specificity'` is enabled
   * app-wide, and ':id' would otherwise swallow '/availability'.
   */
  @Get('availability')
  @ApiOperation({
    summary: 'Bookable slots for a date',
    description:
      'Schedule windows minus taken slots minus unbookable doctors. `after` is inclusive of a slot starting exactly at that time; `before` is exclusive.',
  })
  @ApiOkResponse({ type: AvailableSlotResponseDto, isArray: true })
  findAvailability(@Query() query: FindSlotsQueryDto): Promise<AvailableSlot[]> {
    return this.appointments.findAvailableSlots(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book a slot',
    description:
      'COMMIT-tier: requires `confirmed: true` from a real patient confirmation. Send an idempotencyKey so a retry cannot create a second appointment.',
  })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  @ApiForbiddenResponse({ description: 'Booking was not confirmed by the patient.' })
  @ApiConflictResponse({ description: 'The slot was taken before this booking committed.' })
  book(@Body() body: BookAppointmentDto): Promise<Appointment> {
    return this.appointments.book(body);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Appointment id.' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'No such appointment.' })
  getById(@Param('id') id: string): Promise<Appointment> {
    return this.appointments.getById(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment, freeing its slot' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'No such appointment.' })
  @ApiConflictResponse({ description: 'A completed appointment cannot be cancelled.' })
  cancel(@Param('id') id: string): Promise<Appointment> {
    return this.appointments.cancel(id);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move an appointment to another slot' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'No such appointment.' })
  @ApiConflictResponse({ description: 'The new slot is not available.' })
  reschedule(
    @Param('id') id: string,
    @Body() body: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.reschedule(id, body.date, body.startTime);
  }
}
