import { Module, forwardRef } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { SourcesModule } from '../sources/sources.module';
import { RssIngestionService } from './rss-ingestion.service';
import { RssParserService } from './rss-parser.service';
import { RssSchedulerService } from './rss-scheduler.service';

@Module({
  imports: [forwardRef(() => SourcesModule), ArticlesModule],
  providers: [RssParserService, RssIngestionService, RssSchedulerService],
  exports: [RssIngestionService],
})
export class IngestionModule {}
