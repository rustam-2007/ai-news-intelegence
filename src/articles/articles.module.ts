import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ArticleProcessingScheduler } from './article-processing.scheduler';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlePublishingScheduler } from './article-publishing.scheduler';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

@Module({
  imports: [AiModule, TelegramModule],
  controllers: [ArticlesController],
  providers: [
    ArticlesService,
    ArticleProcessingService,
    ArticleProcessingScheduler,
    ArticlePublishingService,
    ArticlePublishingScheduler,
  ],
  exports: [ArticlesService, ArticleProcessingService, ArticlePublishingService],
})
export class ArticlesModule {}
