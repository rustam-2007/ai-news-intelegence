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
      imageUrl: null,
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
      imageUrl: null,
      source: { name: 'Example' },
    };

    const payload = service.buildTelegramPayload(article);
    const markdownPayload = service.buildMarkdownPayload(article);
    const plainTextPayload = service.buildPlainTextPayload(article);
    const photoPayload = service.buildPhotoPayload({
      ...article,
      imageUrl: 'https://example.com/image.jpg',
    });

    expect(payload.text.length).toBeLessThanOrEqual(4096);
    expect(payload.parseMode).toBe('HTML');
    expect(markdownPayload.text.length).toBeLessThanOrEqual(4096);
    expect(markdownPayload.parseMode).toBe('MarkdownV2');
    expect(plainTextPayload.text.length).toBeLessThanOrEqual(4096);
    expect(photoPayload.caption.length).toBeLessThanOrEqual(1024);
    expect(photoPayload.photo).toBe('https://example.com/image.jpg');
  });
});
