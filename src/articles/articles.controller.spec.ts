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

  beforeEach(async () => {
    articlesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
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
          useValue: {
            publishArticle: jest.fn(),
          },
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
});
