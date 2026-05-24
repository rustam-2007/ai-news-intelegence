import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ProcessedArticleContent {
  rewrittenTitleUz: string;
  summaryUz: string;
  category: string;
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

  async processArticle(input: { title: string; content: string; excerpt: string | null }): Promise<ProcessedArticleContent> {
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
            "You rewrite Uzbek news items. Return concise Uzbek only. Keep facts unchanged. Category must be one of: siyosat, iqtisod, jamiyat, sport, texnologiya, dunyo, madaniyat, boshqa.",
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
                enum: ['siyosat', 'iqtisod', 'jamiyat', 'sport', 'texnologiya', 'dunyo', 'madaniyat', 'boshqa'],
              },
            },
            required: ['rewrittenTitleUz', 'summaryUz', 'category'],
          },
        },
      },
    });

    try {
      return JSON.parse(response.output_text) as ProcessedArticleContent;
    } catch (error) {
      this.logger.error(`failed to parse OpenAI response: ${response.output_text}`);
      throw error;
    }
  }
}
