import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article, Source } from '@prisma/client';

type PublishableArticle = Pick<
  Article,
  'id' | 'title' | 'url' | 'excerpt' | 'rewrittenTitleUz' | 'summaryUz'
> & {
  source: Pick<Source, 'name'>;
};

interface TelegramSendMessageResponse {
  ok: boolean;
  error_code?: number;
  result?: {
    message_id: number;
  };
  description?: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly channelId: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID') || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.botToken && this.channelId);
  }

  getConfigStatus() {
    return {
      botTokenConfigured: Boolean(this.botToken),
      channelConfigured: Boolean(this.channelId),
    };
  }

  formatArticleMessage(article: PublishableArticle): string {
    const title = this.escapeHtml(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapeHtml(article.summaryUz?.trim() || article.excerpt?.trim() || 'No excerpt available.');
    const sourceName = this.escapeHtml(article.source.name);
    const sourceLink = this.escapeHtml(article.url);

    return [
      `<b>${title}</b>`,
      '',
      excerpt,
      '',
      `<a href="${sourceLink}">Read on ${sourceName}</a>`,
    ].join('\n');
  }

  async publishArticle(article: PublishableArticle): Promise<string> {
    if (!this.botToken || !this.channelId) {
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_NOT_CONFIGURED',
        articleId: article.id,
        message: 'Telegram publishing is not configured',
      });
    }

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.channelId,
        text: this.formatArticleMessage(article),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const responseText = await response.text();
    let payload: TelegramSendMessageResponse | null = null;

    try {
      payload = responseText ? (JSON.parse(responseText) as TelegramSendMessageResponse) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} status=${response.status} channelConfigured=true description=${payload?.description ?? responseText}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_HTTP_ERROR',
        articleId: article.id,
        statusCode: response.status,
        message: payload?.description || `Telegram API request failed with status ${response.status}`,
      });
    }

    if (!payload || !payload.ok || !payload.result) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} errorCode=${payload?.error_code ?? 'unknown'} description=${payload?.description ?? 'invalid response'}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_API_ERROR',
        articleId: article.id,
        telegramErrorCode: payload?.error_code,
        message: payload?.description || 'Telegram API returned an invalid response',
      });
    }

    return String(payload.result.message_id);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
