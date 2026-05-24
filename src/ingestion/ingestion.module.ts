import { Module, forwardRef } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { SourcesModule } from '../sources/sources.module';
import { ArticleContentExtractorService } from './article-content-extractor.service';
import { HtmlNewsParserService } from './html-news-parser.service';
import { RssParserService } from './rss-parser.service';
import { RssSchedulerService } from './rss-scheduler.service';
import { SourceIngestionService } from './source-ingestion.service';

@Module({
  imports: [forwardRef(() => SourcesModule), forwardRef(() => ArticlesModule)],
  providers: [
    RssParserService,
    HtmlNewsParserService,
    ArticleContentExtractorService,
    SourceIngestionService,
    RssSchedulerService,
  ],
  exports: [SourceIngestionService, ArticleContentExtractorService],
})
export class IngestionModule {}
