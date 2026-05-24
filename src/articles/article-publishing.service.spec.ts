import { Test, TestingModule } from '@nestjs/testing';
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
});
