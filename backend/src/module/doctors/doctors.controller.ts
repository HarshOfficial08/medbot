import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { DoctorsService } from './doctors.service.js';
import { DoctorDto } from './dto/doctor.dto.js';
import { FindDoctorsQueryDto } from './dto/find-doctors-query.dto.js';
import type { Doctor } from './doctors.types.js';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  // Routing only, no business logic (CLAUDE.md, Building blocks).
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({ summary: 'List doctors, optionally filtered.' })
  @ApiOkResponse({ type: [DoctorDto] })
  find(@Query() query: FindDoctorsQueryDto): Promise<Doctor[]> {
    return this.doctorsService.find(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One doctor by readable id.' })
  @ApiParam({ name: 'id', example: 'DOC001' })
  @ApiOkResponse({ type: DoctorDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findById(@Param('id') id: string): Promise<Doctor> {
    const doctor = await this.doctorsService.findById(id);

    // A missing doctor is a 404, not a 200 with `null`: the agent's tool
    // layer must be able to react to it (CLAUDE.md, Function tools).
    if (doctor === null) {
      throw new NotFoundException(`Doctor '${id}' not found`);
    }

    return doctor;
  }
}
