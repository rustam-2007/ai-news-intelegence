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

  it('creates a concise Telegram excerpt for long rewritten articles', () => {
    const service = new TelegramService(
      new ConfigService({
        TELEGRAM_BOT_TOKEN: 'token',
        TELEGRAM_CHANNEL_ID: 'channel',
      }),
    );

    const longSummary = [
      'Birinchi muhim fakt haqida batafsil maʼlumot berildi va unda asosiy ishtirokchilar, sana hamda raqamlar keltirildi.',
      'Ikkinchi paragrafda voqea rivoji, qaror mazmuni va taʼsir qiladigan tomonlar aniq bayon qilindi.',
      'Uchinchi paragrafda rasmiy izohlar, qoʻshimcha tafsilotlar va keyingi qadamlar qayd etildi.',
      'Toʻrtinchi paragrafda hudud, muddat va jarayonga oid muhim ko‘rsatkichlar sanab o‘tildi.',
      'Beshinchi paragraf voqeaning amaliy natijasi va jamoatchilik uchun eng zarur xulosani taʼkidladi.',
      'Oltinchi paragrafda qoʻshimcha kontekst emas, aynan voqeaga oid muhim maʼlumotlar davom ettirildi.',
      'Yettinchi paragrafda yakuniy raqamlar, ismlar va bayonotlar yana bir bor mustahkamlandi.',
    ].join(' ');

    const payload = service.buildTelegramPayload({
      id: 2,
      title: 'Hello',
      url: 'https://example.com/news',
      excerpt: 'Short excerpt',
      rewrittenTitleUz: 'Sarlavha',
      summaryUz: `${longSummary} ${longSummary} ${longSummary}`,
      imageUrl: null,
      source: { name: 'Example' },
    });

    const lines = payload.text.split('\n');
    const conciseExcerpt = lines[2];

    expect(conciseExcerpt.length).toBeGreaterThanOrEqual(500);
    expect(conciseExcerpt.length).toBeLessThanOrEqual(1000);
    expect(payload.text).toContain('Read on Example');
  });
});
