import { ConfigService } from '@nestjs/config';
import { FacebookCrosspostService } from './facebook-crosspost.service';

describe('FacebookCrosspostService', () => {
  let service: FacebookCrosspostService;

  beforeEach(() => {
    service = new FacebookCrosspostService(
      new ConfigService({
        FACEBOOK_CROSSPOST_ENABLED: true,
        FACEBOOK_CROSSPOST_PROVIDER: 'n8n',
        N8N_FACEBOOK_WEBHOOK_URL: 'https://n8n.patirstudy.uz/webhook/facebook-crosspost',
        N8N_FACEBOOK_WEBHOOK_SECRET: 'secret',
      }),
    );
  });

  it('builds the n8n payload with source title summary url and telegramMessageId', () => {
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
        telegramMessageId: '777',
      },
      facebook: {
        dedupeKey: 'article-123',
        link: 'https://kun.uz/news/123',
      },
    });
    expect(payload.facebook.message).toContain('Qayta yozilgan sarlavha');
    expect(payload.facebook.message).toContain('Qisqa xulosa');
    expect(payload.facebook.message).toContain('Manba: Kun');
    expect(payload.facebook.message).toContain('Batafsil: https://kun.uz/news/123');
  });
});
