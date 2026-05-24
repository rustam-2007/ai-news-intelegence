import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService } from '../ai/openai.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';

describe('ArticleProcessingService', () => {
  let service: ArticleProcessingService;
  let articlesService: {
    findOne: jest.Mock;
    findNewForProcessing: jest.Mock;
    markProcessing: jest.Mock;
    markApproved: jest.Mock;
    markFailed: jest.Mock;
  };
  let openAiService: {
    isConfigured: jest.Mock;
    processArticle: jest.Mock;
    getModel: jest.Mock;
  };

  beforeEach(async () => {
    articlesService = {
      findOne: jest.fn(),
      findNewForProcessing: jest.fn(),
      markProcessing: jest.fn(),
      markApproved: jest.fn(),
      markFailed: jest.fn(),
    };

    openAiService = {
      isConfigured: jest.fn(),
      processArticle: jest.fn(),
      getModel: jest.fn().mockReturnValue('gpt-5.4-mini'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleProcessingService,
        {
          provide: ArticlesService,
          useValue: articlesService,
        },
        {
          provide: OpenAiService,
          useValue: openAiService,
        },
      ],
    }).compile();

    service = module.get<ArticleProcessingService>(ArticleProcessingService);
  });

  it('marks article approved after successful AI processing', async () => {
    articlesService.findOne.mockResolvedValue({
      id: 1,
      title: 'Test',
      content: 'A'.repeat(300),
      excerpt: 'Short excerpt',
      status: 'NEW',
    });
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 1, status: 'APPROVED', category: 'jamiyat' });

    await expect(service.processArticle(1)).resolves.toMatchObject({
      id: 1,
      status: 'APPROVED',
    });
  });

  it('fails articles with too little content', async () => {
    articlesService.findOne.mockResolvedValue({
      id: 2,
      title: 'Test',
      content: 'short',
      excerpt: '',
      status: 'NEW',
    });
    articlesService.markFailed.mockResolvedValue({ id: 2, status: 'FAILED' });

    await expect(service.processArticle(2)).resolves.toMatchObject({
      id: 2,
      status: 'FAILED',
    });
    expect(articlesService.markFailed).toHaveBeenCalledWith(2, 'Article content is too short for AI processing');
  });
});
