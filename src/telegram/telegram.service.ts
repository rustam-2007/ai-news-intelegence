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

interface TelegramPayload {
  text: string;
  parseMode?: 'HTML';
}

const TELEGRAM_TEXT_LIMIT = 4096;

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

    const payload = this.buildTelegramPayload(article);
    let response = await this.sendMessage(payload);
    let responseText = await response.text();
    let parsedPayload = this.parseTelegramResponse(responseText);

    if (this.shouldRetryAsPlainText(response, parsedPayload)) {
      this.logger.warn(`telegram publish retrying as plain text articleId=${article.id}`);
      response = await this.sendMessage(this.buildPlainTextPayload(article));
      responseText = await response.text();
      parsedPayload = this.parseTelegramResponse(responseText);
    }

    if (!response.ok) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} status=${response.status} channelConfigured=true description=${parsedPayload?.description ?? responseText}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_HTTP_ERROR',
        articleId: article.id,
        statusCode: response.status,
        message: parsedPayload?.description || `Telegram API request failed with status ${response.status}`,
      });
    }

    if (!parsedPayload || !parsedPayload.ok || !parsedPayload.result) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} errorCode=${parsedPayload?.error_code ?? 'unknown'} description=${parsedPayload?.description ?? 'invalid response'}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_API_ERROR',
        articleId: article.id,
        telegramErrorCode: parsedPayload?.error_code,
        message: parsedPayload?.description || 'Telegram API returned an invalid response',
      });
    }

    return String(parsedPayload.result.message_id);
  }

  buildTelegramPayload(article: PublishableArticle): TelegramPayload {
    const title = this.escapeHtml(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapeHtml(article.summaryUz?.trim() || article.excerpt?.trim() || 'No excerpt available.');
    const sourceName = this.escapeHtml(article.source.name);
    const sourceLink = this.escapeHtml(article.url);

    const baseParts = [`<b>${title}</b>`, '', excerpt, '', `<a href="${sourceLink}">Read on ${sourceName}</a>`];
    let text = baseParts.join('\n');

    if (text.length > TELEGRAM_TEXT_LIMIT) {
      const reserve = text.length - excerpt.length;
      const allowedExcerptLength = Math.max(160, TELEGRAM_TEXT_LIMIT - reserve - 3);
      const trimmedExcerpt = `${excerpt.slice(0, allowedExcerptLength).trim()}...`;
      text = [`<b>${title}</b>`, '', trimmedExcerpt, '', `<a href="${sourceLink}">Read on ${sourceName}</a>`].join('\n');
    }

    return {
      text,
      parseMode: 'HTML',
    };
  }

  buildPlainTextPayload(article: PublishableArticle): TelegramPayload {
    const title = this.escapePlainText(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapePlainText(article.summaryUz?.trim() || article.excerpt?.trim() || 'No excerpt available.');
    const sourceName = this.escapePlainText(article.source.name);
    let text = [title, '', excerpt, '', `Read on ${sourceName}: ${article.url}`].join('\n');

    if (text.length > TELEGRAM_TEXT_LIMIT) {
      text = `${text.slice(0, TELEGRAM_TEXT_LIMIT - 3).trim()}...`;
    }

    return {
      text,
    };
  }

  private async sendMessage(payload: TelegramPayload): Promise<Response> {
    return fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.channelId,
        text: payload.text,
        parse_mode: payload.parseMode,
        disable_web_page_preview: false,
      }),
    });
  }

  private parseTelegramResponse(responseText: string): TelegramSendMessageResponse | null {
    try {
      return responseText ? (JSON.parse(responseText) as TelegramSendMessageResponse) : null;
    } catch {
      return null;
    }
  }

  private shouldRetryAsPlainText(
    response: Response,
    payload: TelegramSendMessageResponse | null,
  ): boolean {
    return (
      response.status === 400 &&
      Boolean(payload?.description?.toLowerCase().includes('parse') || payload?.description?.toLowerCase().includes('entity'))
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  private escapePlainText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
