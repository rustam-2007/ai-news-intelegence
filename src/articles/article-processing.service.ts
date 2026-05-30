import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article } from '@prisma/client';
import { createHash } from 'crypto';
import { OpenAiResponseParseError, OpenAiService } from '../ai/openai.service';
import { ArticleContentExtractorService } from '../ingestion/article-content-extractor.service';
import { ArticlesService } from './articles.service';
import { getTashkentDayRange } from './tashkent-time.util';

const MIN_ARTICLE_TEXT_LENGTH = 40;
const DEFAULT_AI_MAX_INPUT_CHARS = 2500;
const DEFAULT_AI_MAX_PARAGRAPHS = 4;
const DEFAULT_AI_DAILY_PROCESS_LIMIT = 10;
const DEFAULT_AI_PROCESS_MAX_PER_RUN = 1;
const DEFAULT_AI_PROCESS_FRESH_HOURS = 24;
const DEFAULT_TELEGRAM_DAILY_PUBLISH_LIMIT = 10;
const MIN_PARAGRAPH_LENGTH = 40;
const NOISY_PARAGRAPH_PATTERNS = [
  /related news/iu,
  /o'?xshash yangiliklar/iu,
  /boshqa yangiliklar/iu,
  /eng so'nggi yangiliklar/iu,
  /live/iu,
  /jonli efir/iu,
  /news ticker/iu,
  /reklama/iu,
  /\bad\b/iu,
  /ijtimoiy tarmoqlar/iu,
  /telegram/iu,
  /facebook/iu,
  /instagram/iu,
  /youtube/iu,
  /twitter/iu,
];

@Injectable()
export class ArticleProcessingService {
  private readonly logger = new Logger(ArticleProcessingService.name);
  private readonly maxInputChars: number;
  private readonly maxParagraphs: number;
  private readonly aiDailyProcessLimit: number;
  private readonly aiProcessMaxPerRun: number;
  private readonly aiProcessFreshHours: number;
  private readonly telegramDailyPublishLimit: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly articlesService: ArticlesService,
    private readonly openAiService: OpenAiService,
    @Inject(forwardRef(() => ArticleContentExtractorService))
    private readonly articleContentExtractorService: ArticleContentExtractorService,
  ) {
    this.maxInputChars = this.getPositiveNumberConfig('AI_MAX_INPUT_CHARS', DEFAULT_AI_MAX_INPUT_CHARS);
    this.maxParagraphs = this.getPositiveNumberConfig('AI_MAX_PARAGRAPHS', DEFAULT_AI_MAX_PARAGRAPHS);
    this.aiDailyProcessLimit = this.getPositiveNumberConfig('AI_DAILY_PROCESS_LIMIT', DEFAULT_AI_DAILY_PROCESS_LIMIT);
    this.aiProcessMaxPerRun = this.getPositiveNumberConfig('AI_PROCESS_MAX_PER_RUN', DEFAULT_AI_PROCESS_MAX_PER_RUN);
    this.aiProcessFreshHours = this.getPositiveNumberConfig('AI_PROCESS_FRESH_HOURS', DEFAULT_AI_PROCESS_FRESH_HOURS);
    this.telegramDailyPublishLimit = this.getPositiveNumberConfig(
      'TELEGRAM_DAILY_PUBLISH_LIMIT',
      DEFAULT_TELEGRAM_DAILY_PUBLISH_LIMIT,
    );
  }

  async processArticle(articleId: number): Promise<Article> {
    const article = await this.articlesService.findOne(articleId);
    this.logger.log(`processing requested articleId=${article.id} status=${article.status}`);

    if (article.status === 'APPROVED' || article.status === 'PUBLISHED') {
      return article;
    }

    const processingInput = this.buildProcessingInput(article.title, article.content, article.excerpt);
    if (processingInput.length < MIN_ARTICLE_TEXT_LENGTH) {
      const errorMessage = 'Article content is too short for AI processing';
      this.logger.warn(`processing skipped articleId=${article.id} reason=${errorMessage}`);
      await this.articlesService.markFailed(article.id, errorMessage);
      throw new BadRequestException({
        code: 'ARTICLE_CONTENT_TOO_SHORT',
        articleId: article.id,
        message: errorMessage,
      });
    }

    if (!this.openAiService.isConfigured()) {
      const errorMessage = 'OpenAI processing is not configured';
      this.logger.error(`processing failed articleId=${article.id} reason=${errorMessage}`);
      await this.articlesService.markFailed(article.id, errorMessage);
      throw new ServiceUnavailableException({
        code: 'OPENAI_NOT_CONFIGURED',
        articleId: article.id,
        message: errorMessage,
      });
    }

    await this.articlesService.markProcessing(article.id);

    try {
      this.logger.log(
        `built ai input articleId=${article.id} inputChars=${processingInput.length} maxInputChars=${this.maxInputChars} maxParagraphs=${this.maxParagraphs}`,
      );
      const processed = await this.openAiService.processArticle({
        articleId: article.id,
        title: article.title,
        excerpt: article.excerpt,
        content: processingInput,
      });

      const updatedArticle = await this.articlesService.markApproved(article.id, {
        rewrittenTitleUz: processed.rewrittenTitleUz.trim(),
        summaryUz: processed.summaryUz.trim(),
        category: processed.category.trim(),
        aiModel: this.openAiService.getModel(),
        aiRawResponse: processed.rawResponse,
      });

      this.logger.log(`processed articleId=${article.id} category=${updatedArticle.category ?? 'unknown'}`);
      return updatedArticle;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      const aiRawResponse = error instanceof OpenAiResponseParseError ? error.rawResponse : undefined;
      await this.articlesService.markFailed(article.id, message, { aiRawResponse });
      this.logger.error(`failed to process articleId=${article.id} error=${message}`);
      throw new ServiceUnavailableException({
        code: 'ARTICLE_PROCESSING_FAILED',
        articleId: article.id,
        message,
      });
    }
  }

  async processNewArticles(limit?: number): Promise<number> {
    if (!this.openAiService.isConfigured()) {
      this.logger.warn('AI processing skipped because OPENAI_API_KEY is not configured');
      return 0;
    }

    const requestedLimit = typeof limit === 'number' && limit > 0 ? limit : this.aiProcessMaxPerRun;
    const { start, end } = getTashkentDayRange();
    const [processedToday, publishedToday] = await Promise.all([
      this.articlesService.countProcessedBetween(start, end),
      this.articlesService.countPublishedBetween(start, end),
    ]);
    const processRemaining = Math.max(0, this.aiDailyProcessLimit - processedToday);
    const remainingPublishCapacity = Math.max(0, this.telegramDailyPublishLimit - publishedToday);
    const runLimit = Math.min(requestedLimit, this.aiProcessMaxPerRun, processRemaining, remainingPublishCapacity);

    if (runLimit === 0) {
      this.logger.log(
        `auto-processing completed approved=0 scanned=0 processedToday=${processedToday} dailyProcessLimit=${this.aiDailyProcessLimit} maxPerRun=${this.aiProcessMaxPerRun} remainingPublishCapacity=${remainingPublishCapacity} skippedOld=0 skippedLimit=0`,
      );
      return 0;
    }

    const scanLimit = Math.max(requestedLimit, runLimit * 3);
    const articles = await this.articlesService.findNewForProcessing(scanLimit);
    let processedCount = 0;
    let skippedOld = 0;
    let skippedLimit = 0;

    for (let index = 0; index < articles.length; index += 1) {
      const article = articles[index];
      if (processedCount >= runLimit) {
        skippedLimit = articles.length - index;
        break;
      }

      if (this.isOlderThanFreshWindow(article)) {
        skippedOld += 1;
        continue;
      }

      try {
        const result = await this.processArticle(article.id);
        if (result.status === 'APPROVED') {
          processedCount += 1;
        }
      } catch {
        continue;
      }
    }

    this.logger.log(
      `auto-processing completed approved=${processedCount} scanned=${articles.length} processedToday=${processedToday} dailyProcessLimit=${this.aiDailyProcessLimit} maxPerRun=${this.aiProcessMaxPerRun} remainingPublishCapacity=${remainingPublishCapacity} skippedOld=${skippedOld} skippedLimit=${skippedLimit}`,
    );
    return processedCount;
  }

  async reprocessArticle(articleId: number): Promise<Article> {
    const article = await this.articlesService.findOne(articleId);
    this.logger.log(`manual reprocess requested articleId=${article.id} status=${article.status}`);

    if (article.status === 'PUBLISHED') {
      return article;
    }

    await this.refreshArticleContent(article.id);
    await this.articlesService.resetForReprocess(article.id);
    return this.processArticle(article.id);
  }

  async reprocessFailedArticles(limit = 20): Promise<{
    requested: number;
    reprocessedCount: number;
    failedCount: number;
    articles: Array<{ articleId: number; status: string; error?: string }>;
  }> {
    const articles = await this.articlesService.findFailedForReprocessing(limit);
    const results: Array<{ articleId: number; status: string; error?: string }> = [];
    let reprocessedCount = 0;

    for (const article of articles) {
      try {
        const updated = await this.reprocessArticle(article.id);
        results.push({ articleId: updated.id, status: updated.status });
        reprocessedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown reprocess error';
        this.logger.error(`bulk reprocess failed articleId=${article.id} error=${message}`);
        results.push({ articleId: article.id, status: 'FAILED', error: message });
      }
    }

    return {
      requested: articles.length,
      reprocessedCount,
      failedCount: articles.length - reprocessedCount,
      articles: results,
    };
  }

  private buildProcessingInput(title: string, content: string | null, excerpt: string | null): string {
    const cleanedTitle = this.normalizeWhitespace(title);
    const cleanedExcerpt = this.cleanCandidateText(excerpt);
    const paragraphs = this.extractMeaningfulParagraphs(content);
    const lines = [cleanedTitle];

    if (cleanedExcerpt) {
      lines.push(cleanedExcerpt);
    }

    if (paragraphs.length > 0) {
      lines.push(...paragraphs);
    }

    return this.truncateInput(lines.filter(Boolean).join('\n\n'));
  }

  private async refreshArticleContent(articleId: number): Promise<void> {
    const article = await this.articlesService.findOneWithSource(articleId);

    try {
      const enriched = await this.articleContentExtractorService.enrich(article.source.baseUrl, {
        title: article.title,
        url: article.url,
        content: article.content,
        excerpt: article.excerpt,
        publishedAt: article.publishedAt,
        imageUrl: article.imageUrl,
      });

      await this.articlesService.updateExtractedContent(article.id, {
        title: enriched.title,
        content: enriched.content,
        excerpt: enriched.excerpt,
        imageUrl: enriched.imageUrl,
        contentHash: this.createContentHash(enriched.title, enriched.content, enriched.excerpt),
      });
      this.logger.log(`refreshed article content articleId=${article.id} source=${article.source.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown refresh error';
      this.logger.warn(`article content refresh failed articleId=${article.id} source=${article.source.name} error=${message}`);
    }
  }

  private createContentHash(title: string, content: string | null, excerpt: string | null): string {
    return createHash('sha256')
      .update([title, content ?? '', excerpt ?? ''].join('||'))
      .digest('hex');
  }

  private extractMeaningfulParagraphs(content: string | null): string[] {
    if (!content) {
      return [];
    }

    const rawParagraphs = content
      .split(/\n{2,}|\r\n\r\n/gu)
      .map((paragraph) => this.normalizeWhitespace(paragraph))
      .filter(Boolean);

    const paragraphs: string[] = [];

    for (const rawParagraph of rawParagraphs) {
      if (paragraphs.length >= this.maxParagraphs) {
        break;
      }

      if (NOISY_PARAGRAPH_PATTERNS.some((pattern) => pattern.test(rawParagraph))) {
        continue;
      }

      const paragraph = this.cleanCandidateText(rawParagraph);
      if (!paragraph) {
        continue;
      }

      if (paragraph.length < MIN_PARAGRAPH_LENGTH) {
        continue;
      }

      if (paragraphs[paragraphs.length - 1] === paragraph) {
        continue;
      }

      paragraphs.push(paragraph);
    }

    return paragraphs;
  }

  private cleanCandidateText(value: string | null | undefined): string | null {
    const normalized = this.normalizeWhitespace(value ?? '');
    if (!normalized) {
      return null;
    }

    return normalized
      .replace(/^(related news|o'?xshash yangiliklar|boshqa yangiliklar|eng so'nggi yangiliklar)\s*[:\-–—]?\s*/iu, '')
      .replace(/^(live|jonli efir|news ticker)\s*[:\-–—]?\s*/iu, '')
      .trim();
  }

  private normalizeWhitespace(value: string): string {
    return value
      .replace(/\u00a0/gu, ' ')
      .replace(/[ \t]+/gu, ' ')
      .replace(/\s*\n\s*/gu, '\n')
      .trim();
  }

  private truncateInput(value: string): string {
    if (value.length <= this.maxInputChars) {
      return value;
    }

    return `${value.slice(0, this.maxInputChars - 3).trim()}...`;
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<string | number>(key);
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private isOlderThanFreshWindow(article: Pick<Article, 'publishedAt' | 'createdAt'>): boolean {
    const referenceDate = article.publishedAt ?? article.createdAt;
    const cutoff = Date.now() - this.aiProcessFreshHours * 60 * 60 * 1000;
    return referenceDate.getTime() < cutoff;
  }
}
