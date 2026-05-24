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
});
