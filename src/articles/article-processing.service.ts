import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException, forwardRef } from '@nestjs/common';
import { Article } from '@prisma/client';
import { createHash } from 'crypto';
import { OpenAiService } from '../ai/openai.service';
import { ArticleContentExtractorService } from '../ingestion/article-content-extractor.service';
import { ArticlesService } from './articles.service';

const MIN_ARTICLE_TEXT_LENGTH = 40;
const MAX_PROCESSING_INPUT_LENGTH = 2800;

@Injectable()
export class ArticleProcessingService {
  private readonly logger = new Logger(ArticleProcessingService.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly openAiService: OpenAiService,
    @Inject(forwardRef(() => ArticleContentExtractorService))
    private readonly articleContentExtractorService: ArticleContentExtractorService,
  ) {}

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
      const processed = await this.openAiService.processArticle({
        title: article.title,
        excerpt: article.excerpt,
        content: processingInput,
      });

      const updatedArticle = await this.articlesService.markApproved(article.id, {
        rewrittenTitleUz: processed.rewrittenTitleUz.trim(),
        summaryUz: processed.summaryUz.trim(),
        category: processed.category.trim(),
        aiModel: this.openAiService.getModel(),
      });

      this.logger.log(`processed articleId=${article.id} category=${updatedArticle.category ?? 'unknown'}`);
      return updatedArticle;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processing error';
      await this.articlesService.markFailed(article.id, message);
      this.logger.error(`failed to process articleId=${article.id} error=${message}`);
      throw new ServiceUnavailableException({
        code: 'ARTICLE_PROCESSING_FAILED',
        articleId: article.id,
        message,
      });
    }
  }

  async processNewArticles(limit = 10): Promise<number> {
    if (!this.openAiService.isConfigured()) {
      this.logger.warn('AI processing skipped because OPENAI_API_KEY is not configured');
      return 0;
    }

    const articles = await this.articlesService.findNewForProcessing(limit);
    let processedCount = 0;

    for (const article of articles) {
      try {
        const result = await this.processArticle(article.id);
        if (result.status === 'APPROVED') {
          processedCount += 1;
        }
      } catch {
        continue;
      }
    }

    this.logger.log(`auto-processing completed approved=${processedCount} scanned=${articles.length}`);
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
    return [title, excerpt ?? '', content ?? ''].join('\n\n').trim().slice(0, MAX_PROCESSING_INPUT_LENGTH);
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
}
