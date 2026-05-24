import { Injectable, Logger } from '@nestjs/common';
import { ArticleStatus, Source } from '@prisma/client';
import { createHash } from 'crypto';
import { ArticlesService } from '../articles/articles.service';
import { SourcesService } from '../sources/sources.service';
import { RssParserService } from './rss-parser.service';

export interface SourceFetchResult {
  sourceId: number;
  fetchedCount: number;
  insertedCount: number;
  duplicateCount: number;
}

interface NormalizedRssItem {
  title: string;
  url: string;
  content: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  contentHash: string;
}

@Injectable()
export class RssIngestionService {
  private readonly logger = new Logger(RssIngestionService.name);

  constructor(
    private readonly parserService: RssParserService,
    private readonly sourcesService: SourcesService,
    private readonly articlesService: ArticlesService,
  ) {}

  async fetchActiveSources(): Promise<SourceFetchResult[]> {
    const sources = await this.sourcesService.findActive();
    const results: SourceFetchResult[] = [];

    for (const source of sources) {
      results.push(await this.fetchSource(source));
    }

    return results;
  }

  async fetchSourceById(id: number): Promise<SourceFetchResult> {
    const source = await this.sourcesService.findOne(id);
    return this.fetchSource(source);
  }

  async fetchSource(source: Source): Promise<SourceFetchResult> {
    const items = await this.parserService.parseURL(source.rssUrl);
    let insertedCount = 0;
    let duplicateCount = 0;

    for (const item of items) {
      const normalized = this.normalizeItem(item);
      if (!normalized) {
        continue;
      }

      const exists = await this.articlesService.existsByUrl(normalized.url);
      if (exists) {
        duplicateCount += 1;
        continue;
      }

      await this.articlesService.create({
        sourceId: source.id,
        title: normalized.title,
        url: normalized.url,
        content: normalized.content,
        excerpt: normalized.excerpt,
        publishedAt: normalized.publishedAt,
        contentHash: normalized.contentHash,
        status: ArticleStatus.NEW,
      });
      insertedCount += 1;
    }

    const result = {
      sourceId: source.id,
      fetchedCount: items.length,
      insertedCount,
      duplicateCount,
    };

    this.logger.log(
      `sourceId=${source.id} fetched=${result.fetchedCount} inserted=${result.insertedCount} duplicates=${result.duplicateCount}`,
    );

    return result;
  }

  private normalizeItem(item: {
    title?: string;
    link?: string;
    content?: string;
    'content:encoded'?: string;
    contentSnippet?: string;
    isoDate?: string;
    pubDate?: string;
  }): NormalizedRssItem | null {
    const title = item.title?.trim();
    const url = item.link?.trim();

    if (!title || !url) {
      return null;
    }

    const content = this.cleanText(item['content:encoded'] ?? item.content ?? null);
    const excerpt = this.cleanText(item.contentSnippet ?? content ?? null);
    const publishedAt = this.parseDate(item.isoDate ?? item.pubDate ?? null);
    const contentHash = this.createContentHash(title, content, excerpt);

    return {
      title,
      url,
      content,
      excerpt,
      publishedAt,
      contentHash,
    };
  }

  private cleanText(value: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private parseDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private createContentHash(title: string, content: string | null, excerpt: string | null): string {
    return createHash('sha256')
      .update([title, content ?? '', excerpt ?? ''].join('||'))
      .digest('hex');
  }
}
