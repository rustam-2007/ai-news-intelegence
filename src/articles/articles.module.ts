import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FacebookCrosspostModule } from '../facebook-crosspost/facebook-crosspost.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ArticleProcessingScheduler } from './article-processing.scheduler';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlePublishingScheduler } from './article-publishing.scheduler';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

@Module({
  imports: [AiModule, TelegramModule, FacebookCrosspostModule, forwardRef(() => IngestionModule)],
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
