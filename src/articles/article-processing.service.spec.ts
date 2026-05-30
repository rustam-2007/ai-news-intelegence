import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAiResponseParseError, OpenAiService } from '../ai/openai.service';
import { ArticleContentExtractorService } from '../ingestion/article-content-extractor.service';
import { ArticleProcessingService } from './article-processing.service';
import { ArticlesService } from './articles.service';

describe('ArticleProcessingService', () => {
  let service: ArticleProcessingService;
  let articlesService: {
    findOne: jest.Mock;
    findNewForProcessing: jest.Mock;
    findFailedForReprocessing: jest.Mock;
    countProcessedBetween: jest.Mock;
    countPublishedBetween: jest.Mock;
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
      countProcessedBetween: jest.fn().mockResolvedValue(0),
      countPublishedBetween: jest.fn().mockResolvedValue(0),
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
          provide: ConfigService,
          useValue: new ConfigService({
            AI_MAX_INPUT_CHARS: 2500,
            AI_MAX_PARAGRAPHS: 4,
            AI_DAILY_PROCESS_LIMIT: 10,
            AI_PROCESS_MAX_PER_RUN: 1,
            AI_PROCESS_FRESH_HOURS: 24,
            TELEGRAM_DAILY_PUBLISH_LIMIT: 10,
          }),
        },
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
      rawResponse: '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}',
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

  it('stores raw AI response when parsing fails', async () => {
    articlesService.findOne.mockResolvedValue({
      id: 4,
      title: 'Test',
      content: 'A'.repeat(300),
      excerpt: 'Short excerpt',
      status: 'NEW',
    });
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockRejectedValue(
      new OpenAiResponseParseError('Unable to parse AI response into article fields', 4, '{"broken":'),
    );
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markFailed.mockResolvedValue({ id: 4, status: 'FAILED' });

    await expect(service.processArticle(4)).rejects.toThrow('Unable to parse AI response into article fields');
    expect(articlesService.markFailed).toHaveBeenCalledWith(
      4,
      'Unable to parse AI response into article fields',
      { aiRawResponse: '{"broken":' },
    );
  });

  it('sends only excerpt plus first meaningful paragraphs within limits', async () => {
    const longParagraph = (label: string) => `${label} ` + 'A'.repeat(70);
    articlesService.findOne.mockResolvedValue({
      id: 5,
      title: 'Test title',
      content: [
        'Related news: this should be skipped completely because it is noisy and not useful.',
        longParagraph('Paragraph 1'),
        'Telegram: follow us for more updates.',
        longParagraph('Paragraph 2'),
        longParagraph('Paragraph 3'),
        longParagraph('Paragraph 4'),
        longParagraph('Paragraph 5'),
        longParagraph('Paragraph 6'),
        longParagraph('Paragraph 7'),
      ].join('\n\n'),
      excerpt: 'Useful excerpt',
      status: 'NEW',
    });
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
      rawResponse: '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 5, status: 'APPROVED', category: 'jamiyat' });

    await service.processArticle(5);

    expect(openAiService.processArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 5,
        title: 'Test title',
        excerpt: 'Useful excerpt',
        content: expect.stringContaining('Paragraph 1'),
      }),
    );

    const aiInput = openAiService.processArticle.mock.calls[0][0].content as string;
    expect(aiInput).toContain('Useful excerpt');
    expect(aiInput).toContain('Paragraph 1');
    expect(aiInput).toContain('Paragraph 4');
    expect(aiInput).not.toContain('Paragraph 5');
    expect(aiInput).not.toContain('this should be skipped completely');
    expect(aiInput).not.toContain('Telegram: follow us');
    expect(aiInput.length).toBeLessThanOrEqual(2500);
  });

  it('respects tighter truncation config', async () => {
    const constrainedModule: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleProcessingService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            AI_MAX_INPUT_CHARS: 160,
            AI_MAX_PARAGRAPHS: 4,
            AI_DAILY_PROCESS_LIMIT: 10,
            AI_PROCESS_MAX_PER_RUN: 1,
            AI_PROCESS_FRESH_HOURS: 24,
            TELEGRAM_DAILY_PUBLISH_LIMIT: 10,
          }),
        },
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

    const constrainedService = constrainedModule.get<ArticleProcessingService>(ArticleProcessingService);
    articlesService.findOne.mockResolvedValue({
      id: 6,
      title: 'Compact title',
      content: [
        'Paragraph 1 ' + 'B'.repeat(120),
        'Paragraph 2 ' + 'C'.repeat(120),
        'Paragraph 3 ' + 'D'.repeat(120),
        'Paragraph 4 ' + 'E'.repeat(120),
      ].join('\n\n'),
      excerpt: 'Compact excerpt',
      status: 'NEW',
    });
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
      rawResponse: '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 6, status: 'APPROVED', category: 'jamiyat' });

    await constrainedService.processArticle(6);

    const aiInput = openAiService.processArticle.mock.calls[0][0].content as string;
    expect(aiInput.length).toBeLessThanOrEqual(160);
  });

  it('does not auto-process old NEW backlog articles', async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const freshDate = new Date();
    articlesService.findNewForProcessing.mockResolvedValue([
      { id: 10, status: 'NEW', publishedAt: oldDate, createdAt: oldDate },
      { id: 11, status: 'NEW', publishedAt: freshDate, createdAt: freshDate },
    ]);
    articlesService.findOne.mockResolvedValue({
      id: 11,
      title: 'Fresh title',
      content: 'A'.repeat(300),
      excerpt: 'Fresh excerpt',
      status: 'NEW',
      publishedAt: freshDate,
      createdAt: freshDate,
    });
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
      rawResponse: '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 11, status: 'APPROVED' });

    await expect(service.processNewArticles(10)).resolves.toBe(1);

    expect(openAiService.processArticle).toHaveBeenCalledTimes(1);
    expect(openAiService.processArticle).toHaveBeenCalledWith(expect.objectContaining({ articleId: 11 }));
  });

  it('auto-processing processes max 1 per run by default', async () => {
    const freshDate = new Date();
    articlesService.findNewForProcessing.mockResolvedValue([
      { id: 21, status: 'NEW', publishedAt: freshDate, createdAt: freshDate },
      { id: 22, status: 'NEW', publishedAt: freshDate, createdAt: freshDate },
    ]);
    articlesService.findOne.mockImplementation(async (id: number) => ({
      id,
      title: `Title ${id}`,
      content: 'A'.repeat(300),
      excerpt: 'Fresh excerpt',
      status: 'NEW',
      publishedAt: freshDate,
      createdAt: freshDate,
    }));
    openAiService.isConfigured.mockReturnValue(true);
    openAiService.processArticle.mockResolvedValue({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
      rawResponse: '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}',
    });
    articlesService.markProcessing.mockResolvedValue({});
    articlesService.markApproved.mockResolvedValue({ id: 21, status: 'APPROVED' });

    await expect(service.processNewArticles()).resolves.toBe(1);

    expect(openAiService.processArticle).toHaveBeenCalledTimes(1);
  });

  it('respects the daily AI process limit', async () => {
    articlesService.countProcessedBetween.mockResolvedValue(10);
    openAiService.isConfigured.mockReturnValue(true);

    await expect(service.processNewArticles(10)).resolves.toBe(0);

    expect(articlesService.findNewForProcessing).not.toHaveBeenCalled();
    expect(openAiService.processArticle).not.toHaveBeenCalled();
  });

  it('does not auto-process when remaining Telegram daily capacity is 0', async () => {
    articlesService.countPublishedBetween.mockResolvedValue(10);
    openAiService.isConfigured.mockReturnValue(true);

    await expect(service.processNewArticles()).resolves.toBe(0);

    expect(articlesService.findNewForProcessing).not.toHaveBeenCalled();
    expect(openAiService.processArticle).not.toHaveBeenCalled();
  });
});
