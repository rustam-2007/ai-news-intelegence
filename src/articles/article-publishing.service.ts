import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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
    this.logger.log(`publish requested articleId=${articleId} status=${currentArticle.status}`);

    if (currentArticle.status === 'PROCESSING') {
      throw new ConflictException({
        code: 'ARTICLE_ALREADY_PROCESSING',
        articleId,
        message: 'Article is currently being processed',
      });
    }

    if (currentArticle.status === 'NEW' || this.shouldReprocessFailedArticle(currentArticle)) {
      this.logger.log(`running AI processing before publish for articleId=${articleId}`);
      await this.articleProcessingService.processArticle(articleId);
    }

    const article = await this.articlesService.findOneForPublishing(articleId);
    if (article.status === 'PUBLISHED') {
      return article;
    }

    if (article.status !== 'APPROVED' && !this.canRetryFailedPublish(article)) {
      throw new ConflictException({
        code: 'ARTICLE_NOT_READY_FOR_PUBLISHING',
        articleId,
        status: article.status,
        publishError: article.publishError,
        message: `Article ${articleId} is not ready for publishing`,
      });
    }

    if (!this.telegramService.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_NOT_CONFIGURED',
        articleId,
        message: 'Telegram publishing is not configured',
      });
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
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_PUBLISH_FAILED',
        articleId: article.id,
        message,
      });
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

  private shouldReprocessFailedArticle(article: Article): boolean {
    return article.status === 'FAILED' && !article.rewrittenTitleUz && !article.summaryUz;
  }

  private canRetryFailedPublish(
    article: Article & {
      source: {
        name: string;
      };
    },
  ): boolean {
    return article.status === 'FAILED' && Boolean(article.rewrittenTitleUz || article.summaryUz);
  }
}
