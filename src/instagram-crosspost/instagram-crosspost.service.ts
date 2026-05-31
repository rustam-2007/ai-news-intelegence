import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article, Source } from '@prisma/client';

type InstagramCrosspostArticle = Pick<
  Article,
  | 'id'
  | 'sourceId'
  | 'title'
  | 'url'
  | 'excerpt'
  | 'imageUrl'
  | 'publishedAt'
  | 'processedAt'
  | 'rewrittenTitleUz'
  | 'summaryUz'
  | 'category'
  | 'telegramMessageId'
> & {
  source: Pick<Source, 'name'>;
};

export interface InstagramCrosspostResult {
  success: boolean;
  instagramPostId?: string;
  error?: string;
}

interface InstagramWebhookPayload {
  event: 'article.published.telegram';
  article: {
    id: number;
    sourceId: number;
    sourceName: string;
    title: string;
    rewrittenTitleUz: string | null;
    summaryUz: string | null;
    excerpt: string | null;
    url: string;
    imageUrl: string | null;
    category: string | null;
    publishedAt: string | null;
    processedAt: string | null;
    telegramMessageId: string | null;
  };
  instagram: {
    dedupeKey: string;
    caption: string;
    imageUrl: string;
  };
}

const INSTAGRAM_CAPTION_LIMIT = 2200;
const INSTAGRAM_REQUEST_TIMEOUT_MS = 10000;

@Injectable()
export class InstagramCrosspostService {
  private readonly logger = new Logger(InstagramCrosspostService.name);
  private readonly crosspostEnabled: boolean;
  private readonly provider: string;
  private readonly webhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.crosspostEnabled = this.getBooleanConfig('INSTAGRAM_CROSSPOST_ENABLED', true);
    this.provider = (this.configService.get<string>('INSTAGRAM_CROSSPOST_PROVIDER') || 'n8n').trim().toLowerCase();
    this.webhookUrl = this.configService.get<string>('N8N_INSTAGRAM_WEBHOOK_URL') || undefined;
    this.webhookSecret = this.configService.get<string>('N8N_INSTAGRAM_WEBHOOK_SECRET') || undefined;
  }

  isEnabled(): boolean {
    return this.crosspostEnabled;
  }

  isConfigured(): boolean {
    return Boolean(this.webhookUrl && this.webhookSecret && this.provider === 'n8n');
  }

  getConfigStatus() {
    return {
      crosspostEnabled: this.crosspostEnabled,
      provider: 'n8n' as const,
      webhookConfigured: this.isConfigured(),
    };
  }

  buildInstagramCaption(article: InstagramCrosspostArticle): string {
    const title = (article.rewrittenTitleUz || article.title).trim();
    const summary = this.normalizeMultiline(article.summaryUz || article.excerpt || '');
    const lines = [title];

    if (summary) {
      lines.push('', summary);
    }

    lines.push('', `Manba: ${article.source.name}`);

    if (article.url) {
      lines.push(`Batafsil: ${article.url}`);
    }

    return this.limitCaption(lines.join('\n'));
  }

  buildWebhookPayload(article: InstagramCrosspostArticle): InstagramWebhookPayload {
    if (!article.imageUrl) {
      throw new Error('Instagram publishing requires imageUrl');
    }

    return {
      event: 'article.published.telegram',
      article: {
        id: article.id,
        sourceId: article.sourceId,
        sourceName: article.source.name,
        title: article.title,
        rewrittenTitleUz: article.rewrittenTitleUz ?? null,
        summaryUz: article.summaryUz ?? null,
        excerpt: article.excerpt ?? null,
        url: article.url,
        imageUrl: article.imageUrl,
        category: article.category ?? null,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        processedAt: article.processedAt?.toISOString() ?? null,
        telegramMessageId: article.telegramMessageId ?? null,
      },
      instagram: {
        dedupeKey: `article-${article.id}`,
        caption: this.buildInstagramCaption(article),
        imageUrl: article.imageUrl,
      },
    };
  }

  async crosspostArticle(article: InstagramCrosspostArticle): Promise<InstagramCrosspostResult> {
    if (!this.crosspostEnabled) {
      return {
        success: false,
        error: 'Instagram cross-posting is disabled',
      };
    }

    if (this.provider !== 'n8n') {
      return {
        success: false,
        error: `Unsupported Instagram cross-post provider: ${this.provider || 'unknown'}`,
      };
    }

    if (!article.imageUrl) {
      return {
        success: false,
        error: 'Instagram publishing requires imageUrl',
      };
    }

    if (!this.webhookUrl || !this.webhookSecret) {
      return {
        success: false,
        error: 'Instagram cross-post webhook is not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INSTAGRAM_REQUEST_TIMEOUT_MS);

    try {
      const payload = this.buildWebhookPayload(article);
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-Webhook-Secret': this.webhookSecret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await response.text();
      const responseBody = this.parseJson(responseText);
      const responseError = this.getStringValue(responseBody?.error);
      const responseSuccess = this.getBooleanValue(responseBody?.success);
      const responseInstagramPostId = this.getStringValue(responseBody?.instagramPostId);

      if (!response.ok) {
        return {
          success: false,
          error: this.normalizeError(responseError || responseText || `HTTP ${response.status}`),
        };
      }

      if (!responseSuccess) {
        return {
          success: false,
          error: this.normalizeError(responseError || 'n8n Instagram cross-post failed'),
        };
      }

      return {
        success: true,
        instagramPostId: responseInstagramPostId || undefined,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Instagram cross-post request timed out'
          : error instanceof Error
            ? error.message
            : 'Instagram cross-post request failed';

      this.logger.warn(`instagram cross-post request failed articleId=${article.id} error=${this.normalizeError(message)}`);
      return {
        success: false,
        error: this.normalizeError(message),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeMultiline(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  private limitCaption(value: string): string {
    const normalized = this.normalizeMultiline(value);
    if (!normalized) {
      return '';
    }

    if (normalized.length <= INSTAGRAM_CAPTION_LIMIT) {
      return normalized;
    }

    const truncated = normalized.slice(0, INSTAGRAM_CAPTION_LIMIT + 1);
    const lastWhitespace = truncated.lastIndexOf(' ');
    const safeValue =
      lastWhitespace > 0 ? truncated.slice(0, lastWhitespace) : truncated.slice(0, INSTAGRAM_CAPTION_LIMIT);
    return `${safeValue.trim()}...`;
  }

  private parseJson(value: string): Record<string, unknown> | null {
    try {
      return value ? (JSON.parse(value) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private getStringValue(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private getBooleanValue(value: unknown): boolean {
    return typeof value === 'boolean' ? value : false;
  }

  private normalizeError(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 1000) || 'Unknown Instagram cross-post error';
  }

  private getBooleanConfig(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return fallback;
  }
}
