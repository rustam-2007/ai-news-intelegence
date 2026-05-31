import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticlesService } from './articles.service';
import { InstagramCrosspostService } from '../instagram-crosspost/instagram-crosspost.service';
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
    markInstagramCrosspostPending: jest.Mock;
    markInstagramCrossposted: jest.Mock;
    markInstagramCrosspostFailed: jest.Mock;
    markInstagramCrosspostSkipped: jest.Mock;
    findInstagramBackfillCandidates: jest.Mock;
    findFailedInstagramCrosspostCandidates: jest.Mock;
    countInstagramPostedBetween: jest.Mock;
  };
  let articleProcessingService: {
    processArticle: jest.Mock;
  };
  let telegramService: {
    publishArticle: jest.Mock;
    isConfigured: jest.Mock;
  };
  let instagramCrosspostService: {
    isEnabled: jest.Mock;
    crosspostArticle: jest.Mock;
  };

  beforeEach(async () => {
    articlesService = {
      findOne: jest.fn(),
      findOneForPublishing: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      findNewForPublishing: jest.fn(),
      countPublishedBetween: jest.fn().mockResolvedValue(0),
      markInstagramCrosspostPending: jest.fn(),
      markInstagramCrossposted: jest.fn(),
      markInstagramCrosspostFailed: jest.fn(),
      markInstagramCrosspostSkipped: jest.fn(),
      findInstagramBackfillCandidates: jest.fn(),
      findFailedInstagramCrosspostCandidates: jest.fn(),
      countInstagramPostedBetween: jest.fn().mockResolvedValue(0),
    };

    articleProcessingService = {
      processArticle: jest.fn(),
    };

    telegramService = {
      publishArticle: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };

    instagramCrosspostService = {
      isEnabled: jest.fn().mockReturnValue(true),
      crosspostArticle: jest.fn().mockResolvedValue({
        success: true,
        instagramPostId: 'ig-42',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlePublishingService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTO_PUBLISH_ENABLED: true,
            TELEGRAM_PUBLISHING_ENABLED: true,
            AUTO_PUBLISH_MAX_PER_RUN: 1,
            TELEGRAM_DAILY_PUBLISH_LIMIT: 10,
            AUTO_PUBLISH_FRESH_HOURS: 24,
            INSTAGRAM_CROSSPOST_ENABLED: true,
            INSTAGRAM_BACKFILL_ENABLED: true,
            INSTAGRAM_BACKFILL_LIMIT: 1,
            INSTAGRAM_CROSSPOST_MAX_RETRY_COUNT: 3,
            INSTAGRAM_CROSSPOST_MAX_PER_RUN: 1,
            INSTAGRAM_CROSSPOST_DAILY_LIMIT: 10,
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
        {
          provide: InstagramCrosspostService,
          useValue: instagramCrosspostService,
        },
      ],
    }).compile();

    service = module.get<ArticlePublishingService>(ArticlePublishingService);
  });

  it('marks article as published on successful Telegram send', async () => {
    articlesService.findOne
      .mockResolvedValueOnce({ id: 1, status: 'APPROVED' })
      .mockResolvedValueOnce({ id: 1, status: 'PUBLISHED', telegramMessageId: '42', instagramPostId: 'ig-42' });
    const article = {
      id: 1,
      sourceId: 1,
      title: 'Test',
      url: 'https://example.com/article',
      excerpt: 'Excerpt',
      imageUrl: 'https://example.com/image.jpg',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      telegramMessageId: '42',
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
    expect(instagramCrosspostService.crosspostArticle).toHaveBeenCalledWith(article);
    expect(articlesService.markInstagramCrossposted).toHaveBeenCalledWith(1, 'ig-42');
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
    expect(instagramCrosspostService.crosspostArticle).not.toHaveBeenCalled();
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

  it('auto-publish runs with max 1 per run by default', async () => {
    const now = Date.now();
    articlesService.findNewForPublishing.mockResolvedValue(
      [1, 2, 3].map((id) => ({
        id,
        status: 'APPROVED',
        publishedAt: new Date(now),
        createdAt: new Date(now),
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

    await expect(service.publishNewArticles()).resolves.toBe(1);

    expect(telegramService.publishArticle).toHaveBeenCalledTimes(1);
  });

  it('stores instagram failure without rolling back telegram success', async () => {
    articlesService.findOne
      .mockResolvedValueOnce({ id: 3, status: 'APPROVED' })
      .mockResolvedValueOnce({
        id: 3,
        status: 'PUBLISHED',
        telegramMessageId: '53',
        instagramCrosspostStatus: 'FAILED',
        instagramPostRetryCount: 1,
      });
    const article = {
      id: 3,
      sourceId: 1,
      title: 'Test',
      url: 'https://example.com/article',
      excerpt: 'Excerpt',
      imageUrl: 'https://example.com/image.jpg',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      status: 'APPROVED',
      telegramMessageId: '53',
      source: { name: 'Example' },
    };
    articlesService.findOneForPublishing.mockResolvedValue(article);
    telegramService.publishArticle.mockResolvedValue('53');
    articlesService.markPublished.mockResolvedValue({ id: 3, status: 'PUBLISHED', telegramMessageId: '53' });
    instagramCrosspostService.crosspostArticle.mockResolvedValue({
      success: false,
      error: 'n8n unavailable',
    });

    await expect(service.publishArticle(3)).resolves.toMatchObject({
      id: 3,
      status: 'PUBLISHED',
      telegramMessageId: '53',
    });
    expect(articlesService.markInstagramCrosspostFailed).toHaveBeenCalledWith(3, 'n8n unavailable');
  });

  it('does not call n8n again when instagram is already posted', async () => {
    const article = {
      id: 31,
      status: 'PUBLISHED',
      telegramMessageId: 'existing-telegram',
      instagramPostId: 'existing-instagram',
      instagramCrosspostStatus: 'POSTED',
    };
    articlesService.findOne.mockResolvedValueOnce(article).mockResolvedValueOnce(article);
    articlesService.findOneForPublishing.mockResolvedValue({
      ...article,
      sourceId: 1,
      title: 'Already posted',
      url: 'https://example.com/already-posted',
      excerpt: 'Excerpt',
      summaryUz: 'Summary',
      rewrittenTitleUz: 'AI title',
      category: 'ai',
      imageUrl: null,
      publishedAt: new Date(),
      processedAt: new Date(),
      source: { name: 'Example' },
    });

    await expect(service.publishArticle(31)).resolves.toEqual(article);
    expect(instagramCrosspostService.crosspostArticle).not.toHaveBeenCalled();
  });

  it('backfill respects INSTAGRAM_BACKFILL_LIMIT=1', async () => {
    articlesService.findInstagramBackfillCandidates.mockResolvedValue([
      {
        id: 100,
        sourceId: 1,
        title: 'A',
        url: 'https://example.com/a',
        excerpt: 'Excerpt',
        summaryUz: 'Summary',
        rewrittenTitleUz: 'Title A',
        category: 'ai',
        imageUrl: 'https://example.com/a.jpg',
        publishedAt: new Date(),
        processedAt: new Date(),
        status: 'PUBLISHED',
        telegramMessageId: 'tg-100',
        instagramPostId: null,
        instagramCrosspostStatus: null,
        source: { name: 'Example' },
      },
      {
        id: 101,
        sourceId: 1,
        title: 'B',
        url: 'https://example.com/b',
        excerpt: 'Excerpt',
        summaryUz: 'Summary',
        rewrittenTitleUz: 'Title B',
        category: 'ai',
        imageUrl: 'https://example.com/b.jpg',
        publishedAt: new Date(),
        processedAt: new Date(),
        status: 'PUBLISHED',
        telegramMessageId: 'tg-101',
        instagramPostId: null,
        instagramCrosspostStatus: null,
        source: { name: 'Example' },
      },
    ]);

    const result = await service.backfillInstagramCrossposts(1);

    expect(result).toMatchObject({
      scanned: 2,
      posted: 1,
      skippedDailyLimit: 1,
    });
    expect(instagramCrosspostService.crosspostArticle).toHaveBeenCalledTimes(1);
  });

  it('retry respects INSTAGRAM_CROSSPOST_MAX_RETRY_COUNT', async () => {
    articlesService.findFailedInstagramCrosspostCandidates.mockResolvedValue([]);

    await service.retryFailedInstagramCrossposts();

    expect(articlesService.findFailedInstagramCrosspostCandidates).toHaveBeenCalledWith(1, 3);
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

    await expect(service.publishNewArticles(3)).resolves.toBe(1);

    expect(telegramService.publishArticle).toHaveBeenCalledTimes(1);
    expect(articlesService.findOne).toHaveBeenNthCalledWith(1, 5);
  });

  it('if publishedToday is 9 and maxPerRun is 3, auto-publish publishes only 1', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlePublishingService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AUTO_PUBLISH_ENABLED: true,
            TELEGRAM_PUBLISHING_ENABLED: true,
            AUTO_PUBLISH_MAX_PER_RUN: 3,
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
        {
          provide: InstagramCrosspostService,
          useValue: instagramCrosspostService,
        },
      ],
    }).compile();

    const customService = module.get<ArticlePublishingService>(ArticlePublishingService);
    const now = Date.now();
    articlesService.countPublishedBetween.mockResolvedValue(9);
    articlesService.findNewForPublishing.mockResolvedValue(
      [1, 2, 3].map((id) => ({
        id,
        status: 'APPROVED',
        publishedAt: new Date(now),
        createdAt: new Date(now),
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

    await expect(customService.publishNewArticles(3)).resolves.toBe(1);

    expect(telegramService.publishArticle).toHaveBeenCalledTimes(1);
  });

  it('allows manual publish for an old approved article even if daily limit is reached', async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
    articlesService.findOne
      .mockResolvedValueOnce({
        id: 20,
        status: 'APPROVED',
        telegramMessageId: null,
        publishedAt: oldDate,
        createdAt: oldDate,
      })
      .mockResolvedValueOnce({
        id: 20,
        status: 'PUBLISHED',
        telegramMessageId: '88',
        instagramPostId: 'ig-88',
      });
    articlesService.findOneForPublishing.mockResolvedValue({
      id: 20,
      sourceId: 1,
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
    articlesService.findOne
      .mockResolvedValueOnce({
        id: 30,
        status: 'APPROVED',
        telegramMessageId: 'existing-1',
      })
      .mockResolvedValueOnce({
        id: 30,
        status: 'PUBLISHED',
        telegramMessageId: 'existing-1',
        instagramPostId: 'ig-existing-1',
        instagramCrosspostStatus: 'POSTED',
      });
    articlesService.findOneForPublishing.mockResolvedValue({
      id: 30,
      sourceId: 1,
      title: 'Duplicate article',
      url: 'https://example.com/duplicate',
      excerpt: 'Excerpt',
      summaryUz: 'AI summary',
      rewrittenTitleUz: 'AI title',
      category: 'ai',
      imageUrl: 'https://example.com/duplicate.jpg',
      publishedAt: new Date(),
      processedAt: new Date(),
      status: 'PUBLISHED',
      telegramMessageId: 'existing-1',
      instagramPostId: null,
      instagramCrosspostStatus: null,
      source: { name: 'Example' },
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
    expect(instagramCrosspostService.crosspostArticle).toHaveBeenCalledTimes(1);
  });

  it('does not send again when the article is already published', async () => {
    const publishedArticle = {
      id: 40,
      status: 'PUBLISHED',
      telegramMessageId: 'existing-2',
      instagramPostId: 'ig-existing-2',
      instagramCrosspostStatus: 'POSTED',
    };
    articlesService.findOne.mockResolvedValueOnce(publishedArticle).mockResolvedValueOnce(publishedArticle);
    articlesService.findOneForPublishing.mockResolvedValue({
      ...publishedArticle,
      sourceId: 1,
      title: 'Already published',
      url: 'https://example.com/already-published',
      excerpt: 'Excerpt',
      summaryUz: 'Summary',
      rewrittenTitleUz: 'AI title',
      category: 'ai',
      imageUrl: null,
      publishedAt: new Date(),
      processedAt: new Date(),
      source: { name: 'Example' },
    });

    await expect(service.publishArticle(40)).resolves.toEqual(publishedArticle);

    expect(telegramService.publishArticle).not.toHaveBeenCalled();
    expect(articlesService.markPublished).not.toHaveBeenCalled();
    expect(instagramCrosspostService.crosspostArticle).not.toHaveBeenCalled();
  });
});
