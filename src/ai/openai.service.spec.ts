import { ConfigService } from '@nestjs/config';
import { OpenAiResponseParseError, OpenAiService } from './openai.service';

describe('OpenAiService', () => {
  function createServiceWithResponse(outputText: string) {
    const create = jest.fn().mockResolvedValue({
      output_text: outputText,
    });

    const service = new OpenAiService(
      new ConfigService({
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'gpt-5.4-mini',
        AI_MAX_OUTPUT_TOKENS: 500,
      }),
    );

    Object.assign(service as object, {
      client: {
        responses: {
          create,
        },
      },
    });

    return { service, create };
  }

  it('parses fenced json safely', async () => {
    const { service } = createServiceWithResponse(
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
    const { service } = createServiceWithResponse(
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
    const { service } = createServiceWithResponse('{"rewrittenTitleUz":"Broken","summaryUz":"Unterminated}');

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

  it('sends concise summary constraints to the model', async () => {
    const { service, create } = createServiceWithResponse(
      '{"rewrittenTitleUz":"Yangi sarlavha","summaryUz":"Birinchi paragraf.\\n\\nIkkinchi paragraf.","category":"jamiyat"}',
    );

    await service.processArticle({
      articleId: 10,
      title: 'Test',
      excerpt: 'Short excerpt',
      content: 'Birinchi paragraf.\n\nIkkinchi paragraf.',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_output_tokens: 500,
        input: expect.arrayContaining([
          expect.objectContaining({
            role: 'developer',
            content: expect.stringContaining('Produce a concise Uzbek summary, not a full article rewrite.'),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Tanlangan maqola matni'),
          }),
        ]),
      }),
    );
  });
});
