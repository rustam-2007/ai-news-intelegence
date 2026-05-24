import { Injectable, Logger } from '@nestjs/common';
import { Article } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';

@Injectable()
export class ArticlePublishingService {
  private readonly logger = new Logger(ArticlePublishingService.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleProcessingService: ArticleProcessingService,
    private readonly telegramService: TelegramService,
  ) {}

  async publishArticle(articleId: number): Promise<Article> {
    const currentArticle = await this.articlesService.findOne(articleId);
    if (currentArticle.status === 'NEW') {
      await this.articleProcessingService.processArticle(articleId);
    }

    const article = await this.articlesService.findOneForPublishing(articleId);
    if (article.status !== 'APPROVED' && article.status !== 'PUBLISHED') {
      throw new Error(`Article ${articleId} is not ready for publishing`);
    }

    if (article.status === 'PUBLISHED') {
      return article;
    }

    try {
      const telegramMessageId = await this.telegramService.publishArticle(article);
      const publishedArticle = await this.articlesService.markPublished(article.id, telegramMessageId);
      this.logger.log(`published articleId=${article.id} telegramMessageId=${telegramMessageId}`);
      return publishedArticle;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown publishing error';
      await this.articlesService.markFailed(article.id, message);
      this.logger.error(`failed to publish articleId=${article.id} error=${message}`);
      throw error;
    }
  }

  async publishNewArticles(limit = 10): Promise<number> {
    if (!this.telegramService.isConfigured()) {
      this.logger.warn('telegram publishing skipped because TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not configured');
      return 0;
    }

    const articles = await this.articlesService.findNewForPublishing(limit);
    let publishedCount = 0;

    for (const article of articles) {
      try {
        await this.publishArticle(article.id);
        publishedCount += 1;
      } catch {
        continue;
      }
    }

    this.logger.log(`auto-publish completed published=${publishedCount} scanned=${articles.length}`);
    return publishedCount;
  }
}
