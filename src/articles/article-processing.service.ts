import { Injectable, Logger } from '@nestjs/common';
import { Article } from '@prisma/client';
import { OpenAiService } from '../ai/openai.service';
import { ArticlesService } from './articles.service';

const MIN_ARTICLE_TEXT_LENGTH = 160;
const MAX_PROCESSING_INPUT_LENGTH = 2800;

@Injectable()
export class ArticleProcessingService {
  private readonly logger = new Logger(ArticleProcessingService.name);

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly openAiService: OpenAiService,
  ) {}

  async processArticle(articleId: number): Promise<Article> {
    const article = await this.articlesService.findOne(articleId);

    if (article.status === 'APPROVED' || article.status === 'PUBLISHED') {
      return article;
    }

    const processingInput = this.buildProcessingInput(article.content, article.excerpt);
    if (processingInput.length < MIN_ARTICLE_TEXT_LENGTH) {
      return this.articlesService.markFailed(article.id, 'Article content is too short for AI processing');
    }

    if (!this.openAiService.isConfigured()) {
      return this.articlesService.markFailed(article.id, 'OpenAI processing is not configured');
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
      throw error;
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

  private buildProcessingInput(content: string | null, excerpt: string | null): string {
    return (content ?? excerpt ?? '').trim().slice(0, MAX_PROCESSING_INPUT_LENGTH);
  }
}
