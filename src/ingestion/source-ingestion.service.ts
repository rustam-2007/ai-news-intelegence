import { Injectable, Logger } from '@nestjs/common';
import { ArticleStatus, Source } from '@prisma/client';
import { createHash } from 'crypto';
import { ArticlesService } from '../articles/articles.service';
import { SourcesService } from '../sources/sources.service';
import { FetchSourcesQueryDto } from '../sources/dto/fetch-sources-query.dto';
import { HtmlNewsParserService, ParsedNewsItem } from './html-news-parser.service';
import { RssParserService } from './rss-parser.service';

export interface SourceFetchResult {
  sourceId: number;
  sourceName: string;
  fetchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  skippedOldCount: number;
  latestOnly: boolean;
  limit: number;
}

interface NormalizedNewsItem {
  title: string;
  url: string;
  content: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
  contentHash: string;
  feedIndex: number;
}

const DEFAULT_LATEST_ONLY_LIMIT = 3;

@Injectable()
export class SourceIngestionService {
  private readonly logger = new Logger(SourceIngestionService.name);

  constructor(
    private readonly rssParserService: RssParserService,
    private readonly htmlNewsParserService: HtmlNewsParserService,
    private readonly sourcesService: SourcesService,
    private readonly articlesService: ArticlesService,
  ) {}

  async fetchActiveSources(options?: Partial<FetchSourcesQueryDto>): Promise<SourceFetchResult[]> {
    const sources = await this.sourcesService.findActive();
    const results: SourceFetchResult[] = [];

    for (const source of sources) {
      results.push(await this.fetchSource(source, options));
    }

    return results;
  }

  async fetchSourceById(id: number, options?: Partial<FetchSourcesQueryDto>): Promise<SourceFetchResult> {
    const source = await this.sourcesService.findOne(id);
    return this.fetchSource(source, options);
  }

  async fetchSource(source: Source, options?: Partial<FetchSourcesQueryDto>): Promise<SourceFetchResult> {
    const latestOnly = options?.latestOnly ?? true;
    const limit = options?.limit ?? DEFAULT_LATEST_ONLY_LIMIT;

    try {
      this.logger.log(`fetching source=${source.name} type=${source.sourceType} latestOnly=${latestOnly} limit=${limit}`);
      const parsedItems = await this.parseSource(source);
      const normalizedItems = parsedItems
        .map((item, index) => this.normalizeItem(item, index))
        .filter((item): item is NormalizedNewsItem => item !== null);
      const latestStoredPublishedAt = await this.articlesService.findLatestPublishedAtForSource(source.id);
      const candidateItems = this.selectCandidateItems(normalizedItems, latestOnly, limit, latestStoredPublishedAt);
      let insertedCount = 0;
      let duplicateCount = 0;
      const skippedOldCount = normalizedItems.length - candidateItems.length;
      let newestInsertedPublishedAt: Date | null = latestStoredPublishedAt;

      for (const normalized of candidateItems) {
        const exists = await this.articlesService.existsByUrl(normalized.url);
        if (exists) {
          duplicateCount += 1;
          continue;
        }

        await this.articlesService.create({
          sourceId: source.id,
          title: normalized.title,
          url: this.normalizeUrl(normalized.url),
          content: normalized.content,
          excerpt: normalized.excerpt,
          imageUrl: normalized.imageUrl,
          publishedAt: normalized.publishedAt,
          contentHash: normalized.contentHash,
          status: ArticleStatus.NEW,
          ingestedViaLatestOnly: latestOnly,
        });
        insertedCount += 1;
        newestInsertedPublishedAt = this.maxDate(newestInsertedPublishedAt, normalized.publishedAt);
      }

      await this.sourcesService.markFetchSuccess(source.id, {
        latestArticlePublishedAt: newestInsertedPublishedAt,
      });

      const result = {
        sourceId: source.id,
        sourceName: source.name,
        fetchedCount: normalizedItems.length,
        insertedCount,
        duplicateCount,
        skippedOldCount,
        latestOnly,
        limit,
      };

      this.logger.log(
        `source=${source.name} type=${source.sourceType} fetched=${result.fetchedCount} inserted=${result.insertedCount} duplicates=${result.duplicateCount} skippedOld=${result.skippedOldCount} latestOnly=${result.latestOnly} limit=${result.limit}`,
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown source ingestion error';
      await this.sourcesService.markFetchError(source.id, message);
      this.logger.error(`source=${source.name} type=${source.sourceType} ingestion failed error=${message}`);
      throw error;
    }
  }

  private async parseSource(source: Source): Promise<ParsedNewsItem[]> {
    if (source.sourceType === 'HTML') {
      const latestPageUrl = source.latestPageUrl ?? source.baseUrl;
      return this.htmlNewsParserService.parseLatestPage(latestPageUrl, source.baseUrl);
    }

    if (!source.rssUrl) {
      throw new Error(`RSS source ${source.name} is missing rssUrl`);
    }

    const feedItems = await this.rssParserService.parseURL(source.rssUrl);
    return feedItems.map((item) => ({
      title: item.title?.trim() ?? '',
      url: item.link?.trim() ?? '',
      content: this.cleanText(item['content:encoded' as keyof typeof item] as string | undefined ?? item.content ?? null),
      excerpt: this.cleanText(item.contentSnippet ?? item.content ?? null),
      publishedAt: this.parseDate(item.isoDate ?? item.pubDate ?? null),
      imageUrl: null,
    }));
  }

  private normalizeItem(item: ParsedNewsItem, feedIndex: number): NormalizedNewsItem | null {
    const title = item.title?.trim();
    const url = this.normalizeUrl(item.url?.trim() ?? '');

    if (!title || !url) {
      return null;
    }

    const content = this.cleanText(item.content ?? null);
    const excerpt = this.cleanText(item.excerpt ?? content ?? null);
    const publishedAt = item.publishedAt;
    const imageUrl = this.cleanText(item.imageUrl ?? null);
    const contentHash = this.createContentHash(title, content, excerpt);

    return {
      title,
      url,
      content,
      excerpt,
      publishedAt,
      imageUrl,
      contentHash,
      feedIndex,
    };
  }

  private selectCandidateItems(
    items: NormalizedNewsItem[],
    latestOnly: boolean,
    limit: number,
    latestStoredPublishedAt: Date | null,
  ): NormalizedNewsItem[] {
    if (!latestOnly) {
      return items;
    }

    if (!latestStoredPublishedAt) {
      return [...items].sort((left, right) => this.compareByPublishedAtDesc(left, right)).slice(0, limit);
    }

    return items.filter((item) => item.publishedAt !== null && item.publishedAt > latestStoredPublishedAt);
  }

  private compareByPublishedAtDesc(left: NormalizedNewsItem, right: NormalizedNewsItem): number {
    const leftTime = left.publishedAt?.getTime();
    const rightTime = right.publishedAt?.getTime();

    if (leftTime !== undefined && rightTime !== undefined) {
      return rightTime - leftTime;
    }

    if (leftTime !== undefined) {
      return -1;
    }

    if (rightTime !== undefined) {
      return 1;
    }

    return left.feedIndex - right.feedIndex;
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

  private normalizeUrl(url: string): string {
    if (!url) {
      return url;
    }

    try {
      const parsed = new URL(url);
      parsed.hash = '';
      for (const key of [...parsed.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_')) {
          parsed.searchParams.delete(key);
        }
      }

      if (parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      }

      return parsed.toString();
    } catch {
      return url;
    }
  }

  private maxDate(current: Date | null, next: Date | null): Date | null {
    if (!current) {
      return next;
    }

    if (!next) {
      return current;
    }

    return next > current ? next : current;
  }
}
