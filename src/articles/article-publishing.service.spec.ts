import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticlesService } from './articles.service';
import { TelegramService } from '../telegram/telegram.service';

describe('ArticlePublishingService', () => {
  let service: ArticlePublishingService;
  let articlesService: {
    findOne: jest.Mock;
    findOneForPublishing: jest.Mock;
    markPublished: jest.Mock;
    markFailed: jest.Mock;
    findNewForPublishing: jest.Mock;
    countPublishedBetween: jest.Mock;
  };
  let articleProcessingService: {
    processArticle: jest.Mock;
  };
  let telegramService: {
    publishArticle: jest.Mock;
    isConfigured: jest.Mock;
  };

  beforeEach(async () => {
    articlesService = {
      findOne: jest.fn(),
      findOneForPublishing: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      findNewForPublishing: jest.fn(),
      countPublishedBetween: jest.fn().mockResolvedValue(0),
    };

    articleProcessingService = {
      processArticle: jest.fn(),
    };

    telegramService = {
      publishArticle: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlePublishingService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTO_PUBLISH_ENABLED: true,
            AUTO_PUBLISH_MAX_PER_RUN: 20,
            TELEGRAM_DAILY_PUBLISH_LIMIT: 10,
            AUTO_PUBLISH_FRESH_HOURS: 24,
          }),
        },
        {
          provide: ArticlesService,
          useValue: articlesService,
        },
        {
          provide: ArticleProcessingService,
          useValue: articleProcessingService,
        },
        {
          provide: TelegramService,
          useValue: telegramService,
        },
      ],
    }).compile();

    service = module.get<ArticlePublishingService>(ArticlePublishingService);
  });

  it('marks article as published on successful Telegram send', async () => {
    articlesService.findOne.mockResolvedValue({ id: 1, status: 'APPROVED' });
    const article = {
      id: 1,
      title: 'Test',
      url: 'https://example.com/article',
      excerpt: 'Excerpt',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      source: { name: 'Example' },
    };
    articlesService.findOneForPublishing.mockResolvedValue(article);
    telegramService.publishArticle.mockResolvedValue('42');
    articlesService.markPublished.mockResolvedValue({ id: 1, status: 'PUBLISHED' });

    await expect(service.publishArticle(1)).resolves.toMatchObject({
      id: 1,
      status: 'PUBLISHED',
    });

    expect(articlesService.markPublished).toHaveBeenCalledWith(1, '42');
  });

  it('marks article as failed and increments retries on publish error', async () => {
    articlesService.findOne.mockResolvedValue({ id: 2, status: 'APPROVED' });
    const article = {
      id: 2,
      title: 'Test',
      url: 'https://example.com/article',
      excerpt: 'Excerpt',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      source: { name: 'Example' },
    };
    articlesService.findOneForPublishing.mockResolvedValue(article);
    telegramService.publishArticle.mockRejectedValue(new Error('telegram down'));
    articlesService.markFailed.mockResolvedValue({ id: 2, status: 'FAILED' });

    await expect(service.publishArticle(2)).rejects.toThrow('telegram down');
    expect(articlesService.markFailed).toHaveBeenCalledWith(2, 'telegram down');
  });

  it('skips old approved backlog articles during auto-publish', async () => {
    const now = Date.now();
    articlesService.findNewForPublishing.mockResolvedValue([
      {
        id: 10,
        status: 'APPROVED',
        publishedAt: new Date(now - 30 * 60 * 60 * 1000),
        createdAt: new Date(now - 30 * 60 * 60 * 1000),
        source: { name: 'Example' },
      },
    ]);

    await expect(service.publishNewArticles()).resolves.toBe(0);

    expect(telegramService.publishArticle).not.toHaveBeenCalled();
  });

  it('auto-publish publishes max 10 per Tashkent day', async () => {
    articlesService.countPublishedBetween.mockResolvedValue(10);

    await expect(service.publishNewArticles()).resolves.toBe(0);

    expect(articlesService.findNewForPublishing).not.toHaveBeenCalled();
    expect(telegramService.publishArticle).not.toHaveBeenCalled();
  });

  it('selects newest approved articles first for auto-publish', async () => {
    const now = Date.now();
    articlesService.findNewForPublishing.mockResolvedValue(
      [5, 4, 3].map((id) => ({
        id,
        status: 'APPROVED',
        publishedAt: new Date(now - (5 - id) * 60 * 1000),
        createdAt: new Date(now - (5 - id) * 60 * 1000),
        source: { name: 'Example' },
      })),
    );
    articlesService.findOne.mockImplementation(async (id: number) => ({
      id,
      status: 'APPROVED',
      telegramMessageId: null,
    }));
    articlesService.findOneForPublishing.mockImplementation(async (id: number) => ({
      id,
      title: `Title ${id}`,
      url: `https://example.com/${id}`,
      excerpt: 'Excerpt',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      telegramMessageId: null,
      publishedAt: new Date(now),
      createdAt: new Date(now),
      source: { name: 'Example' },
    }));
    telegramService.publishArticle.mockResolvedValue('42');
    articlesService.markPublished.mockImplementation(async (id: number) => ({
      id,
      status: 'PUBLISHED',
      telegramMessageId: '42',
    }));

    await expect(service.publishNewArticles()).resolves.toBe(3);

    expect(telegramService.publishArticle).toHaveBeenCalledTimes(3);
    expect(articlesService.findOne).toHaveBeenNthCalledWith(1, 5);
    expect(articlesService.findOne).toHaveBeenNthCalledWith(2, 4);
    expect(articlesService.findOne).toHaveBeenNthCalledWith(3, 3);
  });

  it('allows manual publish for an old approved article even if daily limit is reached', async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
    articlesService.findOne.mockResolvedValue({
      id: 20,
      status: 'APPROVED',
      telegramMessageId: null,
      publishedAt: oldDate,
      createdAt: oldDate,
    });
    articlesService.findOneForPublishing.mockResolvedValue({
      id: 20,
      title: 'Old article',
      url: 'https://example.com/old',
      excerpt: 'Excerpt',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      telegramMessageId: null,
      publishedAt: oldDate,
      createdAt: oldDate,
      source: { name: 'Example' },
    });
    telegramService.publishArticle.mockResolvedValue('88');
    articlesService.markPublished.mockResolvedValue({ id: 20, status: 'PUBLISHED', telegramMessageId: '88' });

    await expect(service.publishArticle(20)).resolves.toMatchObject({
      id: 20,
      status: 'PUBLISHED',
      telegramMessageId: '88',
    });
  });

  it('does not send a duplicate message when telegramMessageId already exists', async () => {
    articlesService.findOne.mockResolvedValue({
      id: 30,
      status: 'APPROVED',
      telegramMessageId: 'existing-1',
    });
    articlesService.markPublished.mockResolvedValue({
      id: 30,
      status: 'PUBLISHED',
      telegramMessageId: 'existing-1',
    });

    await expect(service.publishArticle(30)).resolves.toMatchObject({
      id: 30,
      status: 'PUBLISHED',
      telegramMessageId: 'existing-1',
    });

    expect(telegramService.publishArticle).not.toHaveBeenCalled();
    expect(articlesService.markPublished).toHaveBeenCalledWith(30, 'existing-1');
  });

  it('does not send again when the article is already published', async () => {
    const publishedArticle = {
      id: 40,
      status: 'PUBLISHED',
      telegramMessageId: 'existing-2',
    };
    articlesService.findOne.mockResolvedValue(publishedArticle);

    await expect(service.publishArticle(40)).resolves.toEqual(publishedArticle);

    expect(telegramService.publishArticle).not.toHaveBeenCalled();
    expect(articlesService.markPublished).not.toHaveBeenCalled();
  });
});
