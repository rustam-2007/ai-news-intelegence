import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticlesService } from './articles.service';

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articlePublishingService: ArticlePublishingService,
  ) {}

  @Get()
  findAll() {
    return this.articlesService.findAll();
  }

  @Post(':id/publish')
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.articlePublishingService.publishArticle(id);
  }
}
