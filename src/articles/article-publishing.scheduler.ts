import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArticlePublishingService } from './article-publishing.service';

@Injectable()
export class ArticlePublishingScheduler {
  constructor(private readonly articlePublishingService: ArticlePublishingService) {}

  @Cron('0 */5 * * * *')
  async handleCron(): Promise<void> {
    await this.articlePublishingService.publishNewArticles();
  }
}
