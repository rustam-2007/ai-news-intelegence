import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArticleProcessingService } from './article-processing.service';

@Injectable()
export class ArticleProcessingScheduler {
  constructor(private readonly articleProcessingService: ArticleProcessingService) {}

  @Cron('30 */5 * * * *')
  async handleCron(): Promise<void> {
    await this.articleProcessingService.processNewArticles();
  }
}
