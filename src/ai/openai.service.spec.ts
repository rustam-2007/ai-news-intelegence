import { ConfigService } from '@nestjs/config';
import { OpenAiResponseParseError, OpenAiService } from './openai.service';

describe('OpenAiService', () => {
  function createServiceWithResponse(outputText: string) {
    const service = new OpenAiService(
      new ConfigService({
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'gpt-5.4-mini',
      }),
    );

    Object.assign(service as object, {
      client: {
        responses: {
          create: jest.fn().mockResolvedValue({
            output_text: outputText,
          }),
        },
      },
    });

    return service;
  }

  it('parses fenced json safely', async () => {
    const service = createServiceWithResponse(
      '```json\n{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Qisqa xulosa","category":"jamiyat"}\n```',
    );

    await expect(
      service.processArticle({
        articleId: 7,
        title: 'Test',
        excerpt: 'Short excerpt',
        content: 'A'.repeat(200),
      }),
    ).resolves.toMatchObject({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
    });
  });

  it('falls back to labeled text extraction when json is malformed', async () => {
    const service = createServiceWithResponse(
      'rewrittenTitleUz: Yangi sarlavha\nsummaryUz: Qisqa xulosa\ncategory: jamiyat',
    );

    await expect(
      service.processArticle({
        articleId: 8,
        title: 'Test',
        excerpt: 'Short excerpt',
        content: 'A'.repeat(200),
      }),
    ).resolves.toMatchObject({
      rewrittenTitleUz: 'Yangi sarlavha',
      summaryUz: 'Qisqa xulosa',
      category: 'jamiyat',
    });
  });

  it('throws parse error with raw response when parsing still fails', async () => {
    const service = createServiceWithResponse('{"rewrittenTitleUz":"Broken","summaryUz":"Unterminated}');

    await expect(
      service.processArticle({
        articleId: 9,
        title: 'Test',
        excerpt: 'Short excerpt',
        content: 'A'.repeat(200),
      }),
    ).rejects.toMatchObject<OpenAiResponseParseError>({
      name: 'OpenAiResponseParseError',
      articleId: 9,
      rawResponse: '{"rewrittenTitleUz":"Broken","summaryUz":"Unterminated}',
    });
  });
});
