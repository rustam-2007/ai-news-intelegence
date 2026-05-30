import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';
import { getTashkentDayRange } from './tashkent-time.util';

@Injectable()
export class ArticlePublishingService {
  private readonly logger = new Logger(ArticlePublishingService.name);
  private readonly autoPublishEnabled: boolean;
  private readonly autoPublishMaxPerRun: number;
  private readonly autoPublishFreshHours: number;
  private readonly telegramDailyPublishLimit: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly articlesService: ArticlesService,
    private readonly articleProcessingService: ArticleProcessingService,
    private readonly telegramService: TelegramService,
  ) {
    this.autoPublishEnabled = this.getBooleanConfig('AUTO_PUBLISH_ENABLED', true);
    this.autoPublishMaxPerRun = this.getPositiveNumberConfig('AUTO_PUBLISH_MAX_PER_RUN', 3);
    this.autoPublishFreshHours = this.getPositiveNumberConfig('AUTO_PUBLISH_FRESH_HOURS', 24);
    this.telegramDailyPublishLimit = this.getPositiveNumberConfig('TELEGRAM_DAILY_PUBLISH_LIMIT', 10);
  }

  async publishArticle(articleId: number): Promise<Article> {
    const currentArticle = await this.articlesService.findOne(articleId);
    this.logger.log(`publish requested articleId=${articleId} status=${currentArticle.status}`);

    if (currentArticle.telegramMessageId) {
      this.logger.log(
        `publish skipped duplicate articleId=${articleId} telegramMessageId=${currentArticle.telegramMessageId} status=${currentArticle.status}`,
      );
      return currentArticle.status === 'PUBLISHED'
        ? currentArticle
        : this.articlesService.markPublished(articleId, currentArticle.telegramMessageId);
    }

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
    if (!this.autoPublishEnabled) {
      this.logger.warn('auto-publish skipped because AUTO_PUBLISH_ENABLED=false');
      return 0;
    }

    if (!this.telegramService.isConfigured()) {
      this.logger.warn('telegram publishing skipped because TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not configured');
      return 0;
    }

    const { start, end } = getTashkentDayRange();
    const publishedToday = await this.articlesService.countPublishedBetween(start, end);
    const dailyRemaining = Math.max(0, this.telegramDailyPublishLimit - publishedToday);
    if (dailyRemaining === 0) {
      this.logger.log(
        `auto-publish completed scanned=0 published=0 skippedOld=0 skippedDailyLimit=0 publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} dailyLimitReached=true`,
      );
      return 0;
    }

    const runLimit = Math.min(this.autoPublishMaxPerRun, dailyRemaining);
    const scanLimit = Math.max(limit, runLimit * 3);
    const articles = await this.articlesService.findNewForPublishing(scanLimit);
    let publishedCount = 0;
    let skippedOld = 0;
    let skippedDailyLimit = 0;

    for (let index = 0; index < articles.length; index += 1) {
      const article = articles[index];

      if (publishedCount >= runLimit) {
        skippedDailyLimit = articles.length - index;
        this.logger.log(
          `auto-publish max limit reached publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} runLimit=${runLimit}`,
        );
        break;
      }

      if (this.isOlderThanFreshWindow(article)) {
        skippedOld += 1;
        this.logger.log(`auto-publish skipped old articleId=${article.id} freshHours=${this.autoPublishFreshHours}`);
        continue;
      }

      try {
        await this.publishArticle(article.id);
        publishedCount += 1;
      } catch {
        continue;
      }
    }

    this.logger.log(
      `auto-publish completed scanned=${articles.length} published=${publishedCount} skippedOld=${skippedOld} skippedDailyLimit=${skippedDailyLimit} publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} dailyLimitReached=${publishedToday + publishedCount >= this.telegramDailyPublishLimit}`,
    );
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

  private isOlderThanFreshWindow(article: Pick<Article, 'publishedAt' | 'createdAt'>): boolean {
    const referenceDate = article.publishedAt ?? article.createdAt;
    const cutoff = Date.now() - this.autoPublishFreshHours * 60 * 60 * 1000;
    return referenceDate.getTime() < cutoff;
  }

  private getBooleanConfig(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return fallback;
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<string | number>(key);
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
