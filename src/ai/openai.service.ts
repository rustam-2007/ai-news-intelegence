import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const ALLOWED_CATEGORIES = [
  'siyosat',
  'iqtisod',
  'jamiyat',
  'sport',
  'texnologiya',
  'dunyo',
  'madaniyat',
  'boshqa',
] as const;

export interface ProcessedArticleContent {
  rewrittenTitleUz: string;
  summaryUz: string;
  category: string;
  rawResponse: string;
}

export class OpenAiResponseParseError extends Error {
  constructor(
    message: string,
    public readonly articleId: number,
    public readonly rawResponse: string,
  ) {
    super(message);
    this.name = 'OpenAiResponseParseError';
  }
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly model: string;
  private readonly client: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-5.4-mini';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getConfigStatus() {
    return {
      openAiConfigured: this.isConfigured(),
      model: this.model,
    };
  }

  getModel(): string {
    return this.model;
  }

  async processArticle(input: {
    articleId: number;
    title: string;
    content: string;
    excerpt: string | null;
  }): Promise<ProcessedArticleContent> {
    if (!this.client) {
      throw new Error('OpenAI processing is not configured');
    }

    const response = await this.client.responses.create({
      model: this.model,
      reasoning: { effort: 'low' },
      max_output_tokens: 220,
      input: [
        {
          role: 'developer',
          content:
            "You rewrite Uzbek news items. Return concise Uzbek only. Keep facts unchanged. SummaryUz must be at most 500 characters. Category must be one of: siyosat, iqtisod, jamiyat, sport, texnologiya, dunyo, madaniyat, boshqa.",
        },
        {
          role: 'user',
          content: [
            `Sarlavha: ${input.title}`,
            '',
            `Qisqa matn: ${input.excerpt ?? ''}`,
            '',
            `Asosiy matn: ${input.content}`,
          ].join('\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'article_processing',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              rewrittenTitleUz: {
                type: 'string',
              },
              summaryUz: {
                type: 'string',
              },
              category: {
                type: 'string',
                enum: ALLOWED_CATEGORIES as unknown as string[],
              },
            },
            required: ['rewrittenTitleUz', 'summaryUz', 'category'],
          },
        },
      },
    });

    const rawResponse = response.output_text ?? '';

    try {
      const parsed = this.parseProcessedContent(rawResponse);
      this.logger.log(`parsed ai response articleId=${input.articleId} category=${parsed.category}`);
      return {
        ...parsed,
        rawResponse,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI response parse error';
      this.logger.error(`failed to parse ai response articleId=${input.articleId} model=${this.model} error=${message}`);
      throw new OpenAiResponseParseError(message, input.articleId, rawResponse);
    }
  }

  private parseProcessedContent(rawResponse: string): Omit<ProcessedArticleContent, 'rawResponse'> {
    const attempts = [
      rawResponse,
      this.extractJsonBlock(rawResponse),
      this.sanitizeJsonCandidate(this.extractJsonBlock(rawResponse)),
      this.sanitizeJsonCandidate(rawResponse),
    ].filter((value): value is string => Boolean(value?.trim()));

    for (const attempt of attempts) {
      const parsed = this.tryParseCandidate(attempt);
      if (parsed) {
        return parsed;
      }
    }

    const fallbackParsed = this.parseFromTextFallback(rawResponse);
    if (fallbackParsed) {
      return fallbackParsed;
    }

    throw new Error('Unable to parse AI response into article fields');
  }

  private tryParseCandidate(candidate: string): Omit<ProcessedArticleContent, 'rawResponse'> | null {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return this.validateProcessedContent(parsed);
    } catch {
      return null;
    }
  }

  private validateProcessedContent(
    value: Record<string, unknown>,
  ): Omit<ProcessedArticleContent, 'rawResponse'> | null {
    const rewrittenTitleUz = this.normalizeField(value.rewrittenTitleUz);
    const summaryUz = this.normalizeField(value.summaryUz);
    const category = this.normalizeCategory(value.category);

    if (!rewrittenTitleUz || !summaryUz || !category) {
      return null;
    }

    return {
      rewrittenTitleUz,
      summaryUz,
      category,
    };
  }

  private normalizeField(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized || null;
  }

  private normalizeCategory(value: unknown): string | null {
    const normalized = this.normalizeField(value)?.toLowerCase();
    return normalized && ALLOWED_CATEGORIES.includes(normalized as (typeof ALLOWED_CATEGORIES)[number])
      ? normalized
      : null;
  }

  private extractJsonBlock(rawResponse: string): string {
    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = rawResponse.indexOf('{');
    if (firstBrace === -1) {
      return rawResponse;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < rawResponse.length; index += 1) {
      const char = rawResponse[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return rawResponse.slice(firstBrace, index + 1);
        }
      }
    }

    return rawResponse.slice(firstBrace);
  }

  private sanitizeJsonCandidate(value: string): string {
    return value
      .replace(/^\uFEFF/u, '')
      .replace(/[“”]/gu, '"')
      .replace(/[‘’]/gu, "'")
      .replace(/,\s*([}\]])/gu, '$1')
      .replace(/\r\n/gu, '\n')
      .trim();
  }

  private parseFromTextFallback(rawResponse: string): Omit<ProcessedArticleContent, 'rawResponse'> | null {
    const normalized = rawResponse.replace(/\r\n/gu, '\n');
    const rewrittenTitleUz = this.extractLabeledValue(normalized, ['rewrittenTitleUz', 'rewritten_title_uz', 'title']);
    const summaryUz = this.extractLabeledValue(normalized, ['summaryUz', 'summary_uz', 'summary']);
    const category = this.extractLabeledValue(normalized, ['category']);

    if (!rewrittenTitleUz || !summaryUz || !category) {
      return null;
    }

    const validated = this.validateProcessedContent({
      rewrittenTitleUz,
      summaryUz,
      category,
    });

    return validated;
  }

  private extractLabeledValue(rawResponse: string, labels: string[]): string | null {
    for (const label of labels) {
      const quotedPattern = new RegExp(`"${label}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*\\}|$)`, 'iu');
      const quotedMatch = rawResponse.match(quotedPattern);
      if (quotedMatch?.[1]) {
        return this.unescapeLooseString(quotedMatch[1]);
      }

      const plainPattern = new RegExp(`${label}\\s*[:=-]\\s*([^\\n]+)`, 'iu');
      const plainMatch = rawResponse.match(plainPattern);
      if (plainMatch?.[1]) {
        return plainMatch[1].trim().replace(/^["']|["']$/gu, '');
      }
    }

    return null;
  }

  private unescapeLooseString(value: string): string {
    return value
      .replace(/\\"/gu, '"')
      .replace(/\\n/gu, ' ')
      .replace(/\\r/gu, ' ')
      .replace(/\\t/gu, ' ')
      .replace(/\\\\/gu, '\\')
      .replace(/\s+/gu, ' ')
      .trim();
  }
}
