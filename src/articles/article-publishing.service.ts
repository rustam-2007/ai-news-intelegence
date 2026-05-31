import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article } from '@prisma/client';
import { InstagramCrosspostService } from '../instagram-crosspost/instagram-crosspost.service';
import { TelegramService } from '../telegram/telegram.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';
import { getTashkentDayRange } from './tashkent-time.util';

@Injectable()
export class ArticlePublishingService {
  private readonly logger = new Logger(ArticlePublishingService.name);
  private readonly autoPublishEnabled: boolean;
  private readonly telegramPublishingEnabled: boolean;
  private readonly autoPublishMaxPerRun: number;
  private readonly autoPublishFreshHours: number;
  private readonly telegramDailyPublishLimit: number;
  private readonly instagramBackfillEnabled: boolean;
  private readonly instagramBackfillLimit: number;
  private readonly instagramCrosspostMaxRetryCount: number;
  private readonly instagramCrosspostMaxPerRun: number;
  private readonly instagramCrosspostDailyLimit: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly articlesService: ArticlesService,
    private readonly articleProcessingService: ArticleProcessingService,
    private readonly telegramService: TelegramService,
    private readonly instagramCrosspostService: InstagramCrosspostService,
  ) {
    this.autoPublishEnabled = this.getBooleanConfig('AUTO_PUBLISH_ENABLED', true);
    this.telegramPublishingEnabled = this.getBooleanConfig('TELEGRAM_PUBLISHING_ENABLED', true);
    this.autoPublishMaxPerRun = this.getPositiveNumberConfig('AUTO_PUBLISH_MAX_PER_RUN', 1);
    this.autoPublishFreshHours = this.getPositiveNumberConfig('AUTO_PUBLISH_FRESH_HOURS', 24);
    this.telegramDailyPublishLimit = this.getPositiveNumberConfig('TELEGRAM_DAILY_PUBLISH_LIMIT', 10);
    this.instagramBackfillEnabled = this.getBooleanConfig('INSTAGRAM_BACKFILL_ENABLED', false);
    this.instagramBackfillLimit = this.getPositiveNumberConfig('INSTAGRAM_BACKFILL_LIMIT', 1);
    this.instagramCrosspostMaxRetryCount = this.getPositiveNumberConfig('INSTAGRAM_CROSSPOST_MAX_RETRY_COUNT', 3);
    this.instagramCrosspostMaxPerRun = this.getPositiveNumberConfig('INSTAGRAM_CROSSPOST_MAX_PER_RUN', 1);
    this.instagramCrosspostDailyLimit = this.getPositiveNumberConfig('INSTAGRAM_CROSSPOST_DAILY_LIMIT', 10);
  }

  async publishArticle(articleId: number): Promise<Article> {
    const currentArticle = await this.articlesService.findOne(articleId);
    this.logger.log(`publish requested articleId=${articleId} status=${currentArticle.status}`);

    if (currentArticle.telegramMessageId) {
      this.logger.log(
        `publish skipped duplicate articleId=${articleId} telegramMessageId=${currentArticle.telegramMessageId} status=${currentArticle.status}`,
      );
      const publishedArticle =
        currentArticle.status === 'PUBLISHED'
        ? currentArticle
        : this.articlesService.markPublished(articleId, currentArticle.telegramMessageId);

      await this.crosspostPublishedArticleToInstagram(articleId);
      return this.articlesService.findOne((await publishedArticle).id);
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
      await this.articlesService.markPublished(article.id, telegramMessageId);
      await this.crosspostPublishedArticleToInstagram(article.id);
      this.logger.log(`published articleId=${article.id} telegramMessageId=${telegramMessageId}`);
      return this.articlesService.findOne(article.id);
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

  async publishNewArticles(limit?: number): Promise<number> {
    if (!this.autoPublishEnabled) {
      this.logger.warn('auto-publish skipped because AUTO_PUBLISH_ENABLED=false');
      return 0;
    }

    if (!this.telegramPublishingEnabled) {
      this.logger.warn('auto-publish skipped because TELEGRAM_PUBLISHING_ENABLED=false');
      return 0;
    }

    if (!this.telegramService.isConfigured()) {
      this.logger.warn('telegram publishing skipped because TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not configured');
      return 0;
    }

    const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : this.autoPublishMaxPerRun;
    const { start, end } = getTashkentDayRange();
    const publishedToday = await this.articlesService.countPublishedBetween(start, end);
    const dailyRemaining = Math.max(0, this.telegramDailyPublishLimit - publishedToday);
    if (dailyRemaining === 0) {
      this.logger.log(
        `auto-publish completed scanned=0 published=0 skippedOld=0 skippedDailyLimit=0 publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} maxPerRun=${this.autoPublishMaxPerRun} dailyLimitReached=true`,
      );
      return 0;
    }

    const runLimit = Math.min(requestedLimit, this.autoPublishMaxPerRun, dailyRemaining);
    const scanLimit = Math.max(requestedLimit, runLimit * 3);
    const articles = await this.articlesService.findNewForPublishing(scanLimit);
    let publishedCount = 0;
    let skippedOld = 0;
    let skippedDailyLimit = 0;

    for (let index = 0; index < articles.length; index += 1) {
      const article = articles[index];

      if (publishedCount >= runLimit) {
        skippedDailyLimit = articles.length - index;
        this.logger.log(
          `auto-publish max limit reached publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} maxPerRun=${this.autoPublishMaxPerRun} runLimit=${runLimit}`,
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
      `auto-publish completed scanned=${articles.length} published=${publishedCount} skippedOld=${skippedOld} skippedDailyLimit=${skippedDailyLimit} publishedToday=${publishedToday} dailyLimit=${this.telegramDailyPublishLimit} maxPerRun=${this.autoPublishMaxPerRun} dailyLimitReached=${publishedToday + publishedCount >= this.telegramDailyPublishLimit}`,
    );
    return publishedCount;
  }

  async backfillInstagramCrossposts(limit?: number) {
    if (!this.instagramCrosspostService.isEnabled()) {
      this.logger.warn('instagram backfill skipped because INSTAGRAM_CROSSPOST_ENABLED=false');
      return {
        scanned: 0,
        posted: 0,
        skippedAlreadyPosted: 0,
        skippedDailyLimit: 0,
        failed: 0,
      };
    }

    if (!this.instagramBackfillEnabled) {
      this.logger.warn('instagram backfill skipped because INSTAGRAM_BACKFILL_ENABLED=false');
      return {
        scanned: 0,
        posted: 0,
        skippedAlreadyPosted: 0,
        skippedDailyLimit: 0,
        failed: 0,
      };
    }

    const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : this.instagramBackfillLimit;
    const { start, end } = getTashkentDayRange();
    const postedToday = await this.articlesService.countInstagramPostedBetween(start, end);
    const dailyRemaining = Math.max(0, this.instagramCrosspostDailyLimit - postedToday);
    if (dailyRemaining === 0) {
      return {
        scanned: 0,
        posted: 0,
        skippedAlreadyPosted: 0,
        skippedDailyLimit: 0,
        failed: 0,
      };
    }

    const runLimit = Math.min(requestedLimit, this.instagramBackfillLimit, dailyRemaining);
    const articles = await this.articlesService.findInstagramBackfillCandidates(requestedLimit);

    let posted = 0;
    let skippedAlreadyPosted = 0;
    let skippedDailyLimit = 0;
    let failed = 0;

    for (let index = 0; index < articles.length; index += 1) {
      if (posted >= runLimit) {
        skippedDailyLimit = articles.length - index;
        break;
      }

      const result = await this.crosspostPublishedArticleToInstagram(articles[index]);
      if (result === 'posted') {
        posted += 1;
      } else if (result === 'already_posted') {
        skippedAlreadyPosted += 1;
      } else if (result === 'failed') {
        failed += 1;
      }
    }

    this.logger.log(
      `instagram backfill completed scanned=${articles.length} posted=${posted} skippedAlreadyPosted=${skippedAlreadyPosted} skippedDailyLimit=${skippedDailyLimit} failed=${failed}`,
    );

    return {
      scanned: articles.length,
      posted,
      skippedAlreadyPosted,
      skippedDailyLimit,
      failed,
    };
  }

  async retryFailedInstagramCrossposts(limit?: number) {
    if (!this.instagramCrosspostService.isEnabled()) {
      this.logger.warn('instagram retry skipped because INSTAGRAM_CROSSPOST_ENABLED=false');
      return {
        scanned: 0,
        posted: 0,
        skippedAlreadyPosted: 0,
        skippedDailyLimit: 0,
        failed: 0,
      };
    }

    const { start, end } = getTashkentDayRange();
    const postedToday = await this.articlesService.countInstagramPostedBetween(start, end);
    const dailyRemaining = Math.max(0, this.instagramCrosspostDailyLimit - postedToday);
    if (dailyRemaining === 0) {
      return {
        scanned: 0,
        posted: 0,
        skippedAlreadyPosted: 0,
        skippedDailyLimit: 0,
        failed: 0,
      };
    }

    const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : this.instagramCrosspostMaxPerRun;
    const runLimit = Math.min(requestedLimit, this.instagramCrosspostMaxPerRun, dailyRemaining);
    const articles = await this.articlesService.findFailedInstagramCrosspostCandidates(
      requestedLimit,
      this.instagramCrosspostMaxRetryCount,
    );

    let posted = 0;
    let skippedAlreadyPosted = 0;
    let skippedDailyLimit = 0;
    let failed = 0;

    for (let index = 0; index < articles.length; index += 1) {
      if (posted >= runLimit) {
        skippedDailyLimit = articles.length - index;
        break;
      }

      const result = await this.crosspostPublishedArticleToInstagram(articles[index]);
      if (result === 'posted') {
        posted += 1;
      } else if (result === 'already_posted') {
        skippedAlreadyPosted += 1;
      } else if (result === 'failed') {
        failed += 1;
      }
    }

    this.logger.log(
      `instagram retry completed scanned=${articles.length} posted=${posted} skippedAlreadyPosted=${skippedAlreadyPosted} skippedDailyLimit=${skippedDailyLimit} failed=${failed}`,
    );

    return {
      scanned: articles.length,
      posted,
      skippedAlreadyPosted,
      skippedDailyLimit,
      failed,
    };
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

  private async crosspostPublishedArticleToInstagram(articleOrId: number | ({ source: { name: string } } & Article)) {
    if (!this.instagramCrosspostService.isEnabled()) {
      return 'skipped' as const;
    }

    const article =
      typeof articleOrId === 'number' ? await this.articlesService.findOneForPublishing(articleOrId) : articleOrId;

    if (!article.telegramMessageId) {
      await this.articlesService.markInstagramCrosspostSkipped(
        article.id,
        'Telegram message is missing for Instagram cross-post',
      );
      return 'skipped' as const;
    }

    if (!article.imageUrl) {
      await this.articlesService.markInstagramCrosspostSkipped(article.id, 'Instagram publishing requires imageUrl');
      return 'skipped' as const;
    }

    if (article.instagramPostId || article.instagramCrosspostStatus === 'POSTED') {
      return 'already_posted' as const;
    }

    await this.articlesService.markInstagramCrosspostPending(article.id);
    const result = await this.instagramCrosspostService.crosspostArticle(article);

    if (result.success) {
      await this.articlesService.markInstagramCrossposted(article.id, result.instagramPostId);
      this.logger.log(`instagram cross-posted articleId=${article.id} instagramPostId=${result.instagramPostId ?? 'n/a'}`);
      return 'posted' as const;
    }

    await this.articlesService.markInstagramCrosspostFailed(
      article.id,
      result.error || 'Unknown Instagram cross-post error',
    );
    this.logger.warn(`instagram cross-post failed articleId=${article.id} error=${result.error || 'unknown'}`);
    return 'failed' as const;
  }
}
