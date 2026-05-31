import { Test, TestingModule } from '@nestjs/testing';
import { ArticlePublishingService } from './article-publishing.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

describe('ArticlesController', () => {
  let controller: ArticlesController;
  let articlesService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
  };
  let articlePublishingService: {
    publishArticle: jest.Mock;
    backfillInstagramCrossposts: jest.Mock;
    retryFailedInstagramCrossposts: jest.Mock;
  };

  beforeEach(async () => {
    articlesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    };
    articlePublishingService = {
      publishArticle: jest.fn(),
      backfillInstagramCrossposts: jest.fn(),
      retryFailedInstagramCrossposts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: articlesService,
        },
        {
          provide: ArticleProcessingService,
          useValue: {
            reprocessFailedArticles: jest.fn(),
            reprocessArticle: jest.fn(),
          },
        },
        {
          provide: ArticlePublishingService,
          useValue: articlePublishingService,
        },
      ],
    }).compile();

    controller = module.get<ArticlesController>(ArticlesController);
  });

  it('returns the compact list from the service', async () => {
    articlesService.findAll.mockResolvedValue([{ id: 1, title: 'Test' }]);

    await expect(controller.findAll()).resolves.toEqual([{ id: 1, title: 'Test' }]);
    expect(articlesService.findAll).toHaveBeenCalled();
  });

  it('exposes a detail endpoint backed by full article lookup', async () => {
    articlesService.findOne.mockResolvedValue({ id: 3, content: 'Full content' });

    await expect(controller.findOne(3)).resolves.toEqual({ id: 3, content: 'Full content' });
    expect(articlesService.findOne).toHaveBeenCalledWith(3);
  });

  it('exposes the instagram backfill endpoint', async () => {
    articlePublishingService.backfillInstagramCrossposts.mockResolvedValue({
      scanned: 1,
      posted: 1,
      skippedAlreadyPosted: 0,
      skippedDailyLimit: 0,
      failed: 0,
    });

    await expect(controller.backfillInstagram(1)).resolves.toEqual({
      success: true,
      scanned: 1,
      posted: 1,
      skippedAlreadyPosted: 0,
      skippedDailyLimit: 0,
      failed: 0,
    });
    expect(articlePublishingService.backfillInstagramCrossposts).toHaveBeenCalledWith(1);
  });

  it('exposes the instagram retry endpoint', async () => {
    articlePublishingService.retryFailedInstagramCrossposts.mockResolvedValue({
      scanned: 1,
      posted: 1,
      skippedAlreadyPosted: 0,
      skippedDailyLimit: 0,
      failed: 0,
    });

    await expect(controller.retryInstagramCrosspost(1)).resolves.toEqual({
      success: true,
      scanned: 1,
      posted: 1,
      skippedAlreadyPosted: 0,
      skippedDailyLimit: 0,
      failed: 0,
    });
    expect(articlePublishingService.retryFailedInstagramCrossposts).toHaveBeenCalledWith(1);
  });
});
