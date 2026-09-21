import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { DepartmentsService } from './departments.service.js';
import type { Department } from './departments.types.js';
import { DepartmentResponseDto } from './dto/department-response.dto.js';
import { ListDepartmentsQueryDto } from './dto/list-departments.query.dto.js';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List departments, optionally only the active ones.',
  })
  @ApiOkResponse({ type: [DepartmentResponseDto] })
  findAll(@Query() query: ListDepartmentsQueryDto): Promise<Department[]> {
    return this.departments.findAll(query.activeOnly ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One department by its readable id.' })
  @ApiParam({ name: 'id', example: 'DENTAL' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findById(@Param('id') id: string): Promise<Department> {
    const department = await this.departments.findById(id);

    // The service reports "not found" as null; turning that into an HTTP
    // status is the controller's job, not the service's.
    if (!department) {
      throw new NotFoundException(`Department '${id}' not found.`);
    }

    return department;
  }
}
