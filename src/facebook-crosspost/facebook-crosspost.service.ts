import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article, Source } from '@prisma/client';

type FacebookCrosspostArticle = Pick<
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

export interface FacebookCrosspostResult {
  success: boolean;
  facebookPostId?: string;
  error?: string;
}

interface FacebookWebhookPayload {
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
  facebook: {
    dedupeKey: string;
    message: string;
    link: string;
  };
}

const FACEBOOK_SUMMARY_LIMIT = 500;
const FACEBOOK_REQUEST_TIMEOUT_MS = 10000;

@Injectable()
export class FacebookCrosspostService {
  private readonly logger = new Logger(FacebookCrosspostService.name);
  private readonly crosspostEnabled: boolean;
  private readonly provider: string;
  private readonly webhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.crosspostEnabled = this.getBooleanConfig('FACEBOOK_CROSSPOST_ENABLED', true);
    this.provider = (this.configService.get<string>('FACEBOOK_CROSSPOST_PROVIDER') || 'n8n').trim().toLowerCase();
    this.webhookUrl = this.configService.get<string>('N8N_FACEBOOK_WEBHOOK_URL') || undefined;
    this.webhookSecret = this.configService.get<string>('N8N_FACEBOOK_WEBHOOK_SECRET') || undefined;
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

  buildFacebookMessage(article: FacebookCrosspostArticle): string {
    const title = (article.rewrittenTitleUz || article.title).trim();
    const summary = this.buildConciseSummary(article.summaryUz || article.excerpt || '');
    const lines = [title];

    if (summary) {
      lines.push('', summary);
    }

    lines.push('', `Manba: ${article.source.name}`);

    if (article.url) {
      lines.push(`Batafsil: ${article.url}`);
    }

    return lines.join('\n');
  }

  buildWebhookPayload(article: FacebookCrosspostArticle): FacebookWebhookPayload {
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
        imageUrl: article.imageUrl ?? null,
        category: article.category ?? null,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        processedAt: article.processedAt?.toISOString() ?? null,
        telegramMessageId: article.telegramMessageId ?? null,
      },
      facebook: {
        dedupeKey: `article-${article.id}`,
        message: this.buildFacebookMessage(article),
        link: article.url,
      },
    };
  }

  async crosspostArticle(article: FacebookCrosspostArticle): Promise<FacebookCrosspostResult> {
    if (!this.crosspostEnabled) {
      return {
        success: false,
        error: 'Facebook cross-posting is disabled',
      };
    }

    if (this.provider !== 'n8n') {
      return {
        success: false,
        error: `Unsupported Facebook cross-post provider: ${this.provider || 'unknown'}`,
      };
    }

    if (!this.webhookUrl || !this.webhookSecret) {
      return {
        success: false,
        error: 'Facebook cross-post webhook is not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FACEBOOK_REQUEST_TIMEOUT_MS);

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
      const responseFacebookPostId = this.getStringValue(responseBody?.facebookPostId);

      if (!response.ok) {
        return {
          success: false,
          error: this.normalizeError(responseError || responseText || `HTTP ${response.status}`),
        };
      }

      if (!responseSuccess) {
        return {
          success: false,
          error: this.normalizeError(responseError || 'n8n Facebook cross-post failed'),
        };
      }

      return {
        success: true,
        facebookPostId: responseFacebookPostId || undefined,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Facebook cross-post request timed out'
          : error instanceof Error
            ? error.message
            : 'Facebook cross-post request failed';

      this.logger.warn(`facebook cross-post request failed articleId=${article.id} error=${this.normalizeError(message)}`);
      return {
        success: false,
        error: this.normalizeError(message),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildConciseSummary(value: string): string {
    const normalized = value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!normalized) {
      return '';
    }

    if (normalized.length <= FACEBOOK_SUMMARY_LIMIT) {
      return normalized;
    }

    const truncated = normalized.slice(0, FACEBOOK_SUMMARY_LIMIT + 1);
    const lastWhitespace = truncated.lastIndexOf(' ');
    const safeValue = lastWhitespace > 0 ? truncated.slice(0, lastWhitespace) : truncated.slice(0, FACEBOOK_SUMMARY_LIMIT);
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
    return value.replace(/\s+/g, ' ').trim().slice(0, 1000) || 'Unknown Facebook cross-post error';
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
