import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  it('formats a clean Telegram message', () => {
    const service = new TelegramService(
      new ConfigService({
        TELEGRAM_BOT_TOKEN: 'token',
        TELEGRAM_CHANNEL_ID: 'channel',
      }),
    );

    const message = service.formatArticleMessage({
      id: 1,
      title: 'Hello <World>',
      url: 'https://example.com/news',
      excerpt: 'Short & useful',
      rewrittenTitleUz: 'Yangi <sarlavha>',
      summaryUz: 'Qisqa & aniq',
      source: { name: 'Example' },
    });

    expect(message).toContain('<b>Yangi &lt;sarlavha&gt;</b>');
    expect(message).toContain('Qisqa &amp; aniq');
    expect(message).toContain('Read on Example');
  });

  it('trims long content and can build plain text fallback', () => {
    const service = new TelegramService(
      new ConfigService({
        TELEGRAM_BOT_TOKEN: 'token',
        TELEGRAM_CHANNEL_ID: 'channel',
      }),
    );

    const article = {
      id: 1,
      title: 'Hello',
      url: 'https://example.com/news',
      excerpt: 'x'.repeat(5000),
      rewrittenTitleUz: 'Sarlavha',
      summaryUz: 'x'.repeat(5000),
      source: { name: 'Example' },
    };

    const payload = service.buildTelegramPayload(article);
    const plainTextPayload = service.buildPlainTextPayload(article);

    expect(payload.text.length).toBeLessThanOrEqual(4096);
    expect(payload.parseMode).toBe('HTML');
    expect(plainTextPayload.text.length).toBeLessThanOrEqual(4096);
  });
});
