import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RssIngestionService } from './rss-ingestion.service';

@Injectable()
export class RssSchedulerService {
  private readonly logger = new Logger(RssSchedulerService.name);

  constructor(private readonly rssIngestionService: RssIngestionService) {}

  @Cron('0 */15 * * * *')
  async handleCron(): Promise<void> {
    const results = await this.rssIngestionService.fetchActiveSources();
    this.logger.log(`completed scheduled ingestion for ${results.length} sources`);
  }
}
