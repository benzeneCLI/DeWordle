import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-guard.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorators';
import { DlqService } from '../common/dlq.service';

const MAX_DLQ_LIMIT = 500;
const DEFAULT_DLQ_LIMIT = 100;

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/dlq')
export class AdminDlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  @ApiOperation({
    summary: 'Inspect dead-letter queue records',
    description:
      'Returns failed event-processing jobs that exhausted their retry budget, with their original payload and final error.',
  })
  async getDeadLetterRecords(@Query('limit') limit?: string) {
    const parsed =
      Number.parseInt(limit ?? '', 10) || DEFAULT_DLQ_LIMIT;
    const bounded = Math.min(Math.max(parsed, 1), MAX_DLQ_LIMIT);
    return this.dlqService.listDeadLetterJobs(bounded);
  }
}
