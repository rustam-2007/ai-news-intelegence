import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleProcessingService: ArticleProcessingService,
    private readonly articlePublishingService: ArticlePublishingService,
  ) {}

  @Get()
  findAll() {
    return this.articlesService.findAll();
  }

  @Post('reprocess-failed')
  async reprocessFailed(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    const result = await this.articleProcessingService.reprocessFailedArticles(limit);

    return {
      success: true,
      ...result,
    };
  }

  @Post(':id/publish')
  async publish(@Param('id', ParseIntPipe) id: number) {
    const article = await this.articlePublishingService.publishArticle(id);

    return {
      success: true,
      articleId: article.id,
      status: article.status,
      telegramMessageId: article.telegramMessageId,
    };
  }

  @Post(':id/reprocess')
  async reprocess(@Param('id', ParseIntPipe) id: number) {
    const article = await this.articleProcessingService.reprocessArticle(id);

    return {
      success: true,
      articleId: article.id,
      status: article.status,
    };
  }
}
