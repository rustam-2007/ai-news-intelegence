import { ConfigService } from '@nestjs/config';
import { InstagramCrosspostService } from './instagram-crosspost.service';

describe('InstagramCrosspostService', () => {
  let service: InstagramCrosspostService;

  beforeEach(() => {
    service = new InstagramCrosspostService(
      new ConfigService({
        INSTAGRAM_CROSSPOST_ENABLED: true,
        INSTAGRAM_CROSSPOST_PROVIDER: 'n8n',
        N8N_INSTAGRAM_WEBHOOK_URL: 'https://n8n.patirstudy.uz/webhook/instagram-crosspost',
        N8N_INSTAGRAM_WEBHOOK_SECRET: 'secret',
      }),
    );
  });

  it('builds the n8n payload with caption imageUrl and telegramMessageId', () => {
    const payload = service.buildWebhookPayload({
      id: 123,
      sourceId: 1,
      title: 'Original title',
      rewrittenTitleUz: 'Qayta yozilgan sarlavha',
      summaryUz: 'Qisqa xulosa',
      excerpt: 'Asl excerpt',
      url: 'https://kun.uz/news/123',
      imageUrl: 'https://kun.uz/image.jpg',
      category: 'ai',
      publishedAt: new Date('2026-05-30T10:00:00.000Z'),
      processedAt: new Date('2026-05-30T10:30:00.000Z'),
      telegramMessageId: '777',
      source: { name: 'Kun' },
    });

    expect(payload).toMatchObject({
      event: 'article.published.telegram',
      article: {
        id: 123,
        sourceId: 1,
        sourceName: 'Kun',
        title: 'Original title',
        summaryUz: 'Qisqa xulosa',
        url: 'https://kun.uz/news/123',
        imageUrl: 'https://kun.uz/image.jpg',
        telegramMessageId: '777',
      },
      instagram: {
        dedupeKey: 'article-123',
        imageUrl: 'https://kun.uz/image.jpg',
      },
    });
    expect(payload.instagram.caption).toContain('Qayta yozilgan sarlavha');
    expect(payload.instagram.caption).toContain('Qisqa xulosa');
    expect(payload.instagram.caption).toContain('Manba: Kun');
    expect(payload.instagram.caption).toContain('Batafsil: https://kun.uz/news/123');
  });

  it('returns a clear validation error when imageUrl is missing', async () => {
    await expect(
      service.crosspostArticle({
        id: 123,
        sourceId: 1,
        title: 'Original title',
        rewrittenTitleUz: 'Qayta yozilgan sarlavha',
        summaryUz: 'Qisqa xulosa',
        excerpt: 'Asl excerpt',
        url: 'https://kun.uz/news/123',
        imageUrl: null,
        category: 'ai',
        publishedAt: new Date('2026-05-30T10:00:00.000Z'),
        processedAt: new Date('2026-05-30T10:30:00.000Z'),
        telegramMessageId: '777',
        source: { name: 'Kun' },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Instagram publishing requires imageUrl',
    });
  });
});
