import { ArticleContentExtractorService } from './article-content-extractor.service';

describe('ArticleContentExtractorService', () => {
  let service: ArticleContentExtractorService;

  beforeEach(() => {
    service = new ArticleContentExtractorService();
  });

  it('extracts and cleans full article content for Kun article html', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="24.05.2026 12:30 Kun maqolasi sarlavhasi" />
          <meta property="og:image" content="https://kun.uz/image.jpg" />
          <meta name="description" content="Qisqa izoh." />
        </head>
        <body>
          <div class="news-inner__content">
            <div class="share">share buttons</div>
            <p>Birinchi asosiy paragraf juda muhim va yetarlicha uzun matndan iborat.</p>
            <p>Ikkinchi paragraf ham foydali ma'lumot bilan davom etadi.</p>
            <script>console.log('ad')</script>
          </div>
        </body>
      </html>
    `;

    const result = service.extractFromArticleHtml(
      html,
      'https://kun.uz',
      'https://kun.uz/news/2026/05/24/example',
      {
        title: '24.05.2026 12:30 Kun maqolasi sarlavhasi',
        url: 'https://kun.uz/news/2026/05/24/example',
        content: null,
        excerpt: 'Old excerpt',
        publishedAt: null,
        imageUrl: null,
      },
    );

    expect(result.title).toBe('Kun maqolasi sarlavhasi');
    expect(result.content).toContain('Birinchi asosiy paragraf');
    expect(result.content).toContain('Ikkinchi paragraf');
    expect(result.content).not.toContain('share buttons');
    expect(result.imageUrl).toBe('https://kun.uz/image.jpg');
  });

  it('cleans Zamon title timestamps, duplicates, and merged preview text', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="14:24 Toshkentda Tesla bo‘yicha sarlavha Toshkentda Tesla bo‘yicha sarlavha. Haydovchi pushaymonligini aytdi." />
          <meta property="og:image" content="https://zamon.uz/meta.jpg" />
        </head>
        <body>
          <div class="news-content">
            <p>Birinchi paragraf mazmunli va uzun.</p>
            <p>Ikkinchi paragraf davom etadi.</p>
            <img srcset="/small.jpg 320w, /large.jpg 1280w" />
          </div>
        </body>
      </html>
    `;

    const result = service.extractFromArticleHtml(
      html,
      'https://zamon.uz',
      'https://zamon.uz/uz/2026/05/24/tesla',
      {
        title: '14:24 Toshkentda Tesla bo‘yicha sarlavha Toshkentda Tesla bo‘yicha sarlavha. Haydovchi pushaymonligini aytdi.',
        url: 'https://zamon.uz/uz/2026/05/24/tesla',
        content: null,
        excerpt: null,
        publishedAt: null,
        imageUrl: null,
      },
    );

    expect(result.title).toBe('Toshkentda Tesla bo‘yicha sarlavha');
    expect(result.content).toContain('Birinchi paragraf');
    expect(result.content).toContain('Ikkinchi paragraf');
    expect(result.imageUrl).toBe('https://zamon.uz/meta.jpg');
  });
});
