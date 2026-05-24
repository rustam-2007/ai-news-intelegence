import { HtmlNewsParserService } from './html-news-parser.service';

describe('HtmlNewsParserService', () => {
  it('parses Zamon latest-news html', () => {
    const service = new HtmlNewsParserService();
    const html = `
      <section>
        <a href="/uz/2026/05/24/pokistonda-portlash">
          <img src="/images/pokiston.jpg" />
          <span>24.05.2026 15:14</span>
          <h3>Pokistonda portlash oqibatida kamida 19 kishi halok bo‘ldi</h3>
          <p>Mazkur portlash uchun javobgarlikni guruh o‘z zimmasiga oldi.</p>
        </a>
        <a href="/uz/2026/05/24/tesla">
          <span>14:24</span>
          <h3>Toshkentda Tesla’ni 214 km tezlikda boshqargan haydovchiga chora ko‘rildi</h3>
          <p>Haydovchi yuqori tezlikda harakatlangani uchun pushaymon ekanini aytgan.</p>
        </a>
      </section>
    `;

    const items = service.parseHtml(html, 'https://zamon.uz');

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Pokistonda portlash oqibatida kamida 19 kishi halok bo‘ldi',
      url: 'https://zamon.uz/uz/2026/05/24/pokistonda-portlash',
      excerpt: 'Mazkur portlash uchun javobgarlikni guruh o‘z zimmasiga oldi.',
      imageUrl: 'https://zamon.uz/images/pokiston.jpg',
    });
  });

  it('cleans Zamon timestamps and duplicate headline text from anchor text', () => {
    const service = new HtmlNewsParserService();
    const html = `
      <section>
        <a href="/uz/2026/05/24/tesla">
          14:24 Toshkentda Tesla’ni 214 km tezlikda boshqargan haydovchiga chora ko‘rildi
          Toshkentda Tesla’ni 214 km tezlikda boshqargan haydovchiga chora ko‘rildi.
          Haydovchi yuqori tezlikda harakatlangani uchun pushaymon ekanini aytgan.
        </a>
      </section>
    `;

    const items = service.parseHtml(html, 'https://zamon.uz');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Toshkentda Tesla’ni 214 km tezlikda boshqargan haydovchiga chora ko‘rildi',
      excerpt: 'Haydovchi yuqori tezlikda harakatlangani uchun pushaymon ekanini aytgan.',
    });
  });
});
