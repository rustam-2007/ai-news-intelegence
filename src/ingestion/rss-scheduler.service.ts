import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SourceIngestionService } from './source-ingestion.service';

@Injectable()
export class RssSchedulerService {
  private readonly logger = new Logger(RssSchedulerService.name);

  constructor(private readonly sourceIngestionService: SourceIngestionService) {}

  @Cron('0 */15 * * * *', { timeZone: 'Asia/Tashkent' })
  async handleCron(): Promise<void> {
    this.logger.log('starting scheduled source ingestion');
    try {
      const results = await this.sourceIngestionService.fetchActiveSources();
      this.logger.log(`completed scheduled ingestion for ${results.length} sources`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown source ingestion scheduler error';
      this.logger.error(`scheduled source ingestion failed error=${message}`);
    }
  }
}
