import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArticleProcessingService } from './article-processing.service';

@Injectable()
export class ArticleProcessingScheduler {
  constructor(private readonly articleProcessingService: ArticleProcessingService) {}

  // Run once per hour at the top of the hour in Asia/Tashkent before auto-publish.
  @Cron('0 0 * * * *', { timeZone: 'Asia/Tashkent' })
  async handleCron(): Promise<void> {
    await this.articleProcessingService.processNewArticles();
  }
}
