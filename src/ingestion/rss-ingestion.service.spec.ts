import { Test, TestingModule } from '@nestjs/testing';
import { ArticleStatus } from '@prisma/client';
import { ArticlesService } from '../articles/articles.service';
import { SourcesService } from '../sources/sources.service';
import { RssIngestionService } from './rss-ingestion.service';
import { RssParserService } from './rss-parser.service';

describe('RssIngestionService', () => {
  let service: RssIngestionService;
  let parserService: { parseURL: jest.Mock };
  let articlesService: { existsByUrl: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    parserService = {
      parseURL: jest.fn(),
    };

    articlesService = {
      existsByUrl: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RssIngestionService,
        {
          provide: RssParserService,
          useValue: parserService,
        },
        {
          provide: SourcesService,
          useValue: {},
        },
        {
          provide: ArticlesService,
          useValue: articlesService,
        },
      ],
    }).compile();

    service = module.get<RssIngestionService>(RssIngestionService);
  });

  it('stores only new articles and skips duplicates by url', async () => {
    parserService.parseURL.mockResolvedValue([
      {
        title: 'Article 1',
        link: 'https://example.com/a1',
        content: 'Body 1',
        contentSnippet: 'Excerpt 1',
        isoDate: '2026-05-23T10:00:00.000Z',
      },
      {
        title: 'Article 2',
        link: 'https://example.com/a2',
        content: 'Body 2',
      },
    ]);

    articlesService.existsByUrl
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    articlesService.create.mockResolvedValue({});

    const result = await service.fetchSource({
      id: 1,
      name: 'Example',
      baseUrl: 'https://example.com',
      rssUrl: 'https://example.com/rss',
      isActive: true,
      fetchIntervalMinutes: 15,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result).toEqual({
      sourceId: 1,
      fetchedCount: 2,
      insertedCount: 1,
      duplicateCount: 1,
    });

    expect(articlesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 1,
        title: 'Article 1',
        url: 'https://example.com/a1',
        status: ArticleStatus.NEW,
      }),
    );
  });
});
