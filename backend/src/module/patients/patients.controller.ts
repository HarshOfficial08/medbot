import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { PatientsService } from './patients.service.js';
import type { Patient } from './patients.types.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { FindPatientsQueryDto } from './dto/find-patients.query.dto.js';
import { PatientResponseDto } from './dto/patient-response.dto.js';
import { UpdatePatientDto } from './dto/update-patient.dto.js';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({
    summary: 'Look up patients by exact contact number.',
    description:
      'Returns every patient on that number (a household can share one), newest ids last. An empty array means no match — it is not an error.',
  })
  @ApiOkResponse({ type: [PatientResponseDto] })
  findByPhone(@Query() query: FindPatientsQueryDto): Promise<Patient[]> {
    return this.patients.findByPhone(query.phone);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One patient by id.' })
  @ApiParam({ name: 'id', example: 'PAT001' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findById(@Param('id') id: string): Promise<Patient> {
    const patient = await this.patients.findById(id);

    if (!patient) {
      // Only the id is echoed — it is already in the request path. No
      // stored field is quoted back, because those are PHI.
      throw new NotFoundException(`Patient '${id}' not found.`);
    }

    return patient;
  }

  @Post()
  @ApiOperation({
    summary: 'Register a patient, assigning the next sequential id.',
  })
  @ApiCreatedResponse({ type: PatientResponseDto })
  create(@Body() body: CreatePatientDto): Promise<Patient> {
    return this.patients.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update the fields supplied, leaving the rest untouched.',
  })
  @ApiParam({ name: 'id', example: 'PAT001' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePatientDto,
  ): Promise<Patient> {
    const patient = await this.patients.update(id, body);

    if (!patient) {
      throw new NotFoundException(`Patient '${id}' not found.`);
    }

    return patient;
  }
}
