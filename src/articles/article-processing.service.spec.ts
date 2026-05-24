import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService } from '../ai/openai.service';
import { ArticleContentExtractorService } from '../ingestion/article-content-extractor.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';

describe('ArticleProcessingService', () => {
  let service: ArticleProcessingService;
  let articlesService: {
    findOne: jest.Mock;
    findNewForProcessing: jest.Mock;
    findFailedForReprocessing: jest.Mock;
    markProcessing: jest.Mock;
    markApproved: jest.Mock;
    markFailed: jest.Mock;
    findOneWithSource: jest.Mock;
    updateExtractedContent: jest.Mock;
    resetForReprocess: jest.Mock;
  };
  let articleContentExtractorService: {
    enrich: jest.Mock;
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
      findFailedForReprocessing: jest.fn(),
      markProcessing: jest.fn(),
      markApproved: jest.fn(),
      markFailed: jest.fn(),
      findOneWithSource: jest.fn(),
      updateExtractedContent: jest.fn(),
      resetForReprocess: jest.fn(),
    };

    articleContentExtractorService = {
      enrich: jest.fn(),
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
        {
          provide: ArticleContentExtractorService,
          useValue: articleContentExtractorService,
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

    await expect(service.processArticle(2)).rejects.toThrow('Article content is too short for AI processing');
    expect(articlesService.markFailed).toHaveBeenCalledWith(2, 'Article content is too short for AI processing');
  });

  it('reprocesses failed articles after refreshing extracted content', async () => {
    articlesService.findFailedForReprocessing.mockResolvedValue([
      {
        id: 3,
        status: 'FAILED',
      },
    ]);
    articlesService.findOne.mockResolvedValue({
      id: 3,
      status: 'FAILED',
      title: 'Updated title',
      content: 'A'.repeat(300),
      excerpt: 'Fresh excerpt',
    });
    articlesService.findOneWithSource.mockResolvedValue({
      id: 3,
      status: 'FAILED',
      title: 'Old title',
      url: 'https://kun.uz/news/test',
      content: 'short',
      excerpt: 'short',
      publishedAt: null,
      imageUrl: null,
      source: { name: 'Kun', baseUrl: 'https://kun.uz' },
    });
    articleContentExtractorService.enrich.mockResolvedValue({
      title: 'Updated title',
      url: 'https://kun.uz/news/test',
      content: 'A'.repeat(300),
      excerpt: 'Fresh excerpt',
      publishedAt: null,
      imageUrl: 'https://kun.uz/image.jpg',
    });
    articlesService.updateExtractedContent.mockResolvedValue({});
    articlesService.resetForReprocess.mockResolvedValue({});
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 3, status: 'APPROVED' });

    await expect(service.reprocessFailedArticles(10)).resolves.toMatchObject({
      requested: 1,
      reprocessedCount: 1,
      failedCount: 0,
    });

    expect(articleContentExtractorService.enrich).toHaveBeenCalled();
    expect(articlesService.updateExtractedContent).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        title: 'Updated title',
        content: expect.any(String),
        excerpt: 'Fresh excerpt',
        imageUrl: 'https://kun.uz/image.jpg',
      }),
    );
  });
});
