import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Article, Source } from '@prisma/client';

type PublishableArticle = Pick<
  Article,
  'id' | 'title' | 'url' | 'excerpt' | 'rewrittenTitleUz' | 'summaryUz' | 'imageUrl'
> & {
  source: Pick<Source, 'name'>;
};

interface TelegramApiResponse {
  ok: boolean;
  error_code?: number;
  result?: {
    message_id: number;
  };
  description?: string;
}

interface TelegramPayload {
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}

interface TelegramPhotoPayload {
  photo: string;
  caption: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}

interface TelegramResponseState {
  response: Response;
  responseText: string;
  parsedPayload: TelegramApiResponse | null;
}

const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_CONCISE_TRIGGER = 1500;
const TELEGRAM_CONCISE_MIN_LENGTH = 500;
const TELEGRAM_CONCISE_MAX_LENGTH = 1000;

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
    return this.buildTelegramPayload(article).text;
  }

  async publishArticle(article: PublishableArticle): Promise<string> {
    if (!this.botToken || !this.channelId) {
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_NOT_CONFIGURED',
        articleId: article.id,
        message: 'Telegram publishing is not configured',
      });
    }

    const responseState = article.imageUrl
      ? await this.sendPhotoWithFallback(article)
      : await this.sendTextWithFallback(article);

    if (!responseState.response.ok) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} status=${responseState.response.status} channelConfigured=true description=${responseState.parsedPayload?.description ?? responseState.responseText}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_HTTP_ERROR',
        articleId: article.id,
        statusCode: responseState.response.status,
        message:
          responseState.parsedPayload?.description ||
          `Telegram API request failed with status ${responseState.response.status}`,
      });
    }

    if (!responseState.parsedPayload || !responseState.parsedPayload.ok || !responseState.parsedPayload.result) {
      this.logger.error(
        `telegram publish failed articleId=${article.id} errorCode=${responseState.parsedPayload?.error_code ?? 'unknown'} description=${responseState.parsedPayload?.description ?? 'invalid response'}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_API_ERROR',
        articleId: article.id,
        telegramErrorCode: responseState.parsedPayload?.error_code,
        message: responseState.parsedPayload?.description || 'Telegram API returned an invalid response',
      });
    }

    return String(responseState.parsedPayload.result.message_id);
  }

  buildTelegramPayload(article: PublishableArticle): TelegramPayload {
    const title = this.escapeHtml(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapeHtml(this.buildTelegramExcerpt(article));
    const sourceName = this.escapeHtml(article.source.name);
    const sourceLink = this.escapeHtml(article.url);

    let text = [`<b>${title}</b>`, '', excerpt, '', `<a href="${sourceLink}">Read on ${sourceName}</a>`].join('\n');

    if (text.length > TELEGRAM_TEXT_LIMIT) {
      text = this.trimHtmlMessage(title, excerpt, sourceName, sourceLink, TELEGRAM_TEXT_LIMIT);
    }

    return {
      text,
      parseMode: 'HTML',
    };
  }

  buildMarkdownPayload(article: PublishableArticle, limit = TELEGRAM_TEXT_LIMIT): TelegramPayload {
    const title = this.escapeMarkdownV2(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapeMarkdownV2(this.buildTelegramExcerpt(article));
    const sourceName = this.escapeMarkdownV2(article.source.name);
    const sourceLink = this.escapeMarkdownV2(article.url);

    let text = [`*${title}*`, '', excerpt, '', `[Read on ${sourceName}](${sourceLink})`].join('\n');
    if (text.length > limit) {
      const reserve = text.length - excerpt.length;
      const allowedExcerptLength = Math.max(120, limit - reserve - 3);
      text = [`*${title}*`, '', `${excerpt.slice(0, allowedExcerptLength).trim()}...`, '', `[Read on ${sourceName}](${sourceLink})`].join('\n');
    }

    return {
      text,
      parseMode: 'MarkdownV2',
    };
  }

  buildPlainTextPayload(article: PublishableArticle): TelegramPayload {
    const title = this.escapePlainText(article.rewrittenTitleUz?.trim() || article.title);
    const excerpt = this.escapePlainText(this.buildTelegramExcerpt(article));
    const sourceName = this.escapePlainText(article.source.name);
    let text = [title, '', excerpt, '', `Read on ${sourceName}: ${article.url}`].join('\n');

    if (text.length > TELEGRAM_TEXT_LIMIT) {
      text = `${text.slice(0, TELEGRAM_TEXT_LIMIT - 3).trim()}...`;
    }

    return {
      text,
    };
  }

  buildPhotoPayload(article: PublishableArticle): TelegramPhotoPayload {
    const htmlPayload = this.buildTelegramPayload(article);
    return {
      photo: article.imageUrl!,
      caption:
        htmlPayload.text.length > TELEGRAM_CAPTION_LIMIT
          ? `${htmlPayload.text.slice(0, TELEGRAM_CAPTION_LIMIT - 3).trim()}...`
          : htmlPayload.text,
      parseMode: htmlPayload.parseMode,
    };
  }

  private async sendTextWithFallback(article: PublishableArticle): Promise<TelegramResponseState> {
    let response = await this.sendMessage(this.buildTelegramPayload(article));
    let responseText = await response.text();
    let parsedPayload = this.parseTelegramResponse(responseText);

    if (this.shouldRetryWithEscapingFallback(response, parsedPayload)) {
      this.logger.warn(`telegram publish retrying as markdown articleId=${article.id}`);
      response = await this.sendMessage(this.buildMarkdownPayload(article));
      responseText = await response.text();
      parsedPayload = this.parseTelegramResponse(responseText);
    }

    if (this.shouldRetryWithEscapingFallback(response, parsedPayload)) {
      this.logger.warn(`telegram publish retrying as plain text articleId=${article.id}`);
      response = await this.sendMessage(this.buildPlainTextPayload(article));
      responseText = await response.text();
      parsedPayload = this.parseTelegramResponse(responseText);
    }

    return { response, responseText, parsedPayload };
  }

  private async sendPhotoWithFallback(article: PublishableArticle): Promise<TelegramResponseState> {
    let response = await this.sendPhoto(this.buildPhotoPayload(article));
    let responseText = await response.text();
    let parsedPayload = this.parseTelegramResponse(responseText);

    if (this.shouldRetryWithEscapingFallback(response, parsedPayload)) {
      this.logger.warn(`telegram photo publish retrying as markdown articleId=${article.id}`);
      response = await this.sendPhoto(this.buildMarkdownPhotoPayload(article));
      responseText = await response.text();
      parsedPayload = this.parseTelegramResponse(responseText);
    }

    if (this.shouldRetryWithEscapingFallback(response, parsedPayload)) {
      this.logger.warn(`telegram photo publish retrying as plain text articleId=${article.id}`);
      response = await this.sendPhoto(this.buildPlainTextPhotoPayload(article));
      responseText = await response.text();
      parsedPayload = this.parseTelegramResponse(responseText);
    }

    if (!response.ok) {
      this.logger.warn(
        `telegram photo publish failed articleId=${article.id} status=${response.status} description=${parsedPayload?.description ?? responseText}; falling back to sendMessage`,
      );
      return this.sendTextWithFallback(article);
    }

    return { response, responseText, parsedPayload };
  }

  private buildMarkdownPhotoPayload(article: PublishableArticle): TelegramPhotoPayload {
    const markdownPayload = this.buildMarkdownPayload(article, TELEGRAM_CAPTION_LIMIT);
    return {
      photo: article.imageUrl!,
      caption: markdownPayload.text,
      parseMode: markdownPayload.parseMode,
    };
  }

  private buildPlainTextPhotoPayload(article: PublishableArticle): TelegramPhotoPayload {
    const plainTextPayload = this.buildPlainTextPayload(article);
    return {
      photo: article.imageUrl!,
      caption:
        plainTextPayload.text.length > TELEGRAM_CAPTION_LIMIT
          ? `${plainTextPayload.text.slice(0, TELEGRAM_CAPTION_LIMIT - 3).trim()}...`
          : plainTextPayload.text,
    };
  }

  private trimHtmlMessage(
    title: string,
    excerpt: string,
    sourceName: string,
    sourceLink: string,
    limit: number,
  ): string {
    const reserve = [`<b>${title}</b>`, '', '', '', `<a href="${sourceLink}">Read on ${sourceName}</a>`].join('\n').length;
    const allowedExcerptLength = Math.max(160, limit - reserve - 3);
    const trimmedExcerpt = `${excerpt.slice(0, allowedExcerptLength).trim()}...`;
    return [`<b>${title}</b>`, '', trimmedExcerpt, '', `<a href="${sourceLink}">Read on ${sourceName}</a>`].join('\n');
  }

  private buildTelegramExcerpt(article: PublishableArticle): string {
    const baseText = article.summaryUz?.trim() || article.excerpt?.trim() || 'No excerpt available.';
    return baseText.length > TELEGRAM_CONCISE_TRIGGER ? this.createConciseVersion(baseText) : baseText;
  }

  private createConciseVersion(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (normalized.length <= TELEGRAM_CONCISE_MAX_LENGTH) {
      return normalized;
    }

    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const segments = paragraphs.flatMap((paragraph) => this.splitIntoSegments(paragraph));
    let concise = '';

    for (const segment of segments) {
      const candidate = concise ? `${concise} ${segment}` : segment;
      if (candidate.length > TELEGRAM_CONCISE_MAX_LENGTH) {
        break;
      }

      concise = candidate;
      if (concise.length >= TELEGRAM_CONCISE_MIN_LENGTH) {
        return concise;
      }
    }

    if (!concise) {
      return this.trimToWordBoundary(normalized, TELEGRAM_CONCISE_MAX_LENGTH);
    }

    if (concise.length < TELEGRAM_CONCISE_MIN_LENGTH) {
      return this.trimToWordBoundary(normalized, TELEGRAM_CONCISE_MAX_LENGTH);
    }

    return concise;
  }

  private splitIntoSegments(paragraph: string): string[] {
    const segments = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    return segments.length ? segments : [paragraph];
  }

  private trimToWordBoundary(text: string, limit: number): string {
    if (text.length <= limit) {
      return text;
    }

    const slice = text.slice(0, limit + 1);
    const lastSpace = slice.lastIndexOf(' ');
    return (lastSpace >= 0 ? slice.slice(0, lastSpace) : slice.slice(0, limit)).trim();
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

  private async sendPhoto(payload: TelegramPhotoPayload): Promise<Response> {
    return fetch(`https://api.telegram.org/bot${this.botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.channelId,
        photo: payload.photo,
        caption: payload.caption,
        parse_mode: payload.parseMode,
      }),
    });
  }

  private parseTelegramResponse(responseText: string): TelegramApiResponse | null {
    try {
      return responseText ? (JSON.parse(responseText) as TelegramApiResponse) : null;
    } catch {
      return null;
    }
  }

  private shouldRetryWithEscapingFallback(
    response: Response,
    payload: TelegramApiResponse | null,
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

  private escapeMarkdownV2(value: string): string {
    return value.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}
