import { Injectable, Logger } from '@nestjs/common';
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
      throw new Error('Telegram publishing is not configured');
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

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`telegram publish failed with status=${response.status} body=${text}`);
      throw new Error(`Telegram API request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as TelegramSendMessageResponse;
    if (!payload.ok || !payload.result) {
      throw new Error(payload.description || 'Telegram API returned an invalid response');
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
