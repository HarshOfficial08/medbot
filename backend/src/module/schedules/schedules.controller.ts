import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { SchedulesService } from './schedules.service.js';
import { CreateScheduleDto } from './dto/create-schedule.dto.js';
import { FindSchedulesQueryDto } from './dto/find-schedules-query.dto.js';
import { ScheduleDto } from './dto/schedule.dto.js';
import type { Schedule } from './schedules.types.js';

@ApiTags('schedules')
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: "A doctor's working windows, optionally for one weekday." })
  @ApiOkResponse({ type: [ScheduleDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  find(@Query() query: FindSchedulesQueryDto): Promise<Schedule[]> {
    return query.dayOfWeek === undefined
      ? this.schedulesService.findByDoctor(query.doctorId)
      : this.schedulesService.findByDoctorAndDay(query.doctorId, query.dayOfWeek);
  }

  @Post()
  @ApiOperation({ summary: 'Define a recurring working window.' })
  @ApiCreatedResponse({ type: ScheduleDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  create(@Body() body: CreateScheduleDto): Promise<Schedule> {
    return this.schedulesService.create(body);
  }
}
