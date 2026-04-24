import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CronJobsService } from './cron-jobs.service';

@ApiTags('cron-jobs')
@ApiBearerAuth()
@Controller('admin/cron-jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class CronJobsController {
  constructor(private readonly service: CronJobsService) {}

  /**
   * GET /admin/cron-jobs
   * List all registered cron jobs with their last execution + stats.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister tous les cron jobs (super_admin)' })
  @ApiResponse({ status: 200, description: 'Liste des cron jobs' })
  listJobs() {
    return this.service.listJobs();
  }

  /**
   * GET /admin/cron-jobs/:jobName/history
   * Paginated history of a specific job.
   */
  @Get(':jobName/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique d\'un cron job' })
  getHistory(
    @Param('jobName') jobName: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.service.getHistory(
      jobName,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
