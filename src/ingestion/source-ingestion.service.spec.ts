import { Test, TestingModule } from '@nestjs/testing';
import { ArticleStatus } from '@prisma/client';
import { ArticlesService } from '../articles/articles.service';
import { SourcesService } from '../sources/sources.service';
import { ArticleContentExtractorService } from './article-content-extractor.service';
import { HtmlNewsParserService } from './html-news-parser.service';
import { RssParserService } from './rss-parser.service';
import { SourceIngestionService } from './source-ingestion.service';

describe('SourceIngestionService', () => {
  let service: SourceIngestionService;
  let rssParserService: { parseURL: jest.Mock };
  let htmlNewsParserService: { parseLatestPage: jest.Mock };
  let articleContentExtractorService: { enrich: jest.Mock };
  let sourcesService: {
    findActive: jest.Mock;
    markFetchSuccess: jest.Mock;
    markFetchError: jest.Mock;
  };
  let articlesService: {
    existsByUrl: jest.Mock;
    create: jest.Mock;
    findLatestPublishedAtForSource: jest.Mock;
  };

  const rssSource = {
    id: 1,
    name: 'Kun',
    sourceType: 'RSS' as const,
    baseUrl: 'https://kun.uz',
    rssUrl: 'https://kun.uz/news/rss',
    latestPageUrl: 'https://kun.uz/news',
    isActive: true,
    fetchIntervalMinutes: 15,
    lastFetchedAt: null,
    latestArticlePublishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const htmlSource = {
    id: 2,
    name: 'Zamon',
    sourceType: 'HTML' as const,
    baseUrl: 'https://zamon.uz',
    rssUrl: null,
    latestPageUrl: 'https://zamon.uz/uz/news',
    isActive: true,
    fetchIntervalMinutes: 15,
    lastFetchedAt: null,
    latestArticlePublishedAt: null,
    lastSuccessAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    rssParserService = {
      parseURL: jest.fn(),
    };
    htmlNewsParserService = {
      parseLatestPage: jest.fn(),
    };
    articleContentExtractorService = {
      enrich: jest.fn((_, item) => Promise.resolve(item)),
    };
    sourcesService = {
      findActive: jest.fn(),
      markFetchSuccess: jest.fn(),
      markFetchError: jest.fn(),
    };
    articlesService = {
      existsByUrl: jest.fn(),
      create: jest.fn(),
      findLatestPublishedAtForSource: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceIngestionService,
        {
          provide: RssParserService,
          useValue: rssParserService,
        },
        {
          provide: HtmlNewsParserService,
          useValue: htmlNewsParserService,
        },
        {
          provide: ArticleContentExtractorService,
          useValue: articleContentExtractorService,
        },
        {
          provide: SourcesService,
          useValue: sourcesService,
        },
        {
          provide: ArticlesService,
          useValue: articlesService,
        },
      ],
    }).compile();

    service = module.get<SourceIngestionService>(SourceIngestionService);
  });

  it('first latest-only fetch inserts only the newest 3 articles', async () => {
    rssParserService.parseURL.mockResolvedValue([
      { title: 'Old', link: 'https://kun.uz/1', isoDate: '2026-05-24T08:00:00.000Z', content: 'A' },
      { title: 'Newest', link: 'https://kun.uz/4', isoDate: '2026-05-24T11:00:00.000Z', content: 'D' },
      { title: 'Mid 2', link: 'https://kun.uz/3', isoDate: '2026-05-24T10:00:00.000Z', content: 'C' },
      { title: 'Mid 1', link: 'https://kun.uz/2', isoDate: '2026-05-24T09:00:00.000Z', content: 'B' },
    ]);
    articlesService.findLatestPublishedAtForSource.mockResolvedValue(null);
    articlesService.existsByUrl.mockResolvedValue(false);
    articlesService.create.mockResolvedValue({});
    sourcesService.markFetchSuccess.mockResolvedValue({});

    const result = await service.fetchSource(rssSource, { latestOnly: true, limit: 3 });

    expect(result).toEqual({
      sourceId: 1,
      sourceName: 'Kun',
      fetchedCount: 4,
      insertedCount: 3,
      duplicateCount: 0,
      skippedOldCount: 1,
      latestOnly: true,
      limit: 3,
    });
    expect(articlesService.create).toHaveBeenCalledTimes(3);
  });

  it('skips duplicate urls', async () => {
    rssParserService.parseURL.mockResolvedValue([
      { title: 'A1', link: 'https://kun.uz/a1', isoDate: '2026-05-24T12:00:00.000Z', content: 'A' },
      { title: 'A2', link: 'https://kun.uz/a2', isoDate: '2026-05-24T11:00:00.000Z', content: 'B' },
    ]);
    articlesService.findLatestPublishedAtForSource.mockResolvedValue(null);
    articlesService.existsByUrl.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    articlesService.create.mockResolvedValue({});
    sourcesService.markFetchSuccess.mockResolvedValue({});

    const result = await service.fetchSource(rssSource, { latestOnly: true, limit: 3 });

    expect(result.insertedCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(articlesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://kun.uz/a1',
        status: ArticleStatus.NEW,
        ingestedViaLatestOnly: true,
      }),
    );
  });

  it('fetch-all works across Kun, Qalampir, and Zamon', async () => {
    const qalampirSource = {
      ...rssSource,
      id: 3,
      name: 'Qalampir',
      baseUrl: 'https://qalampir.uz',
      rssUrl: 'https://qalampir.uz/rss',
      latestPageUrl: 'https://qalampir.uz/uz',
    };
    sourcesService.findActive.mockResolvedValue([rssSource, qalampirSource, htmlSource]);
    rssParserService.parseURL.mockImplementation((url: string) => {
      if (url.includes('kun')) {
        return Promise.resolve([{ title: 'Kun News', link: 'https://kun.uz/a', isoDate: '2026-05-24T12:00:00.000Z', content: 'A' }]);
      }

      return Promise.resolve([{ title: 'Qalampir News', link: 'https://qalampir.uz/a', isoDate: '2026-05-24T12:05:00.000Z', content: 'B' }]);
    });
    htmlNewsParserService.parseLatestPage.mockResolvedValue([
      {
        title: 'Zamon News',
        url: 'https://zamon.uz/uz/2026/05/24/zamon-news',
        content: 'C',
        excerpt: 'C',
        publishedAt: new Date('2026-05-24T12:10:00.000Z'),
        imageUrl: 'https://zamon.uz/image.jpg',
      },
    ]);
    articlesService.findLatestPublishedAtForSource.mockResolvedValue(null);
    articlesService.existsByUrl.mockResolvedValue(false);
    articlesService.create.mockResolvedValue({});
    sourcesService.markFetchSuccess.mockResolvedValue({});

    const results = await service.fetchActiveSources({ limit: 3 });

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.sourceName)).toEqual(['Kun', 'Qalampir', 'Zamon']);
    expect(articlesService.create).toHaveBeenCalledTimes(3);
  });
});
