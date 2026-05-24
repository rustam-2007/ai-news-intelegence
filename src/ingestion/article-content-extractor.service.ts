import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ParsedNewsItem } from './html-news-parser.service';

@Injectable()
export class ArticleContentExtractorService {
  async enrich(sourceBaseUrl: string, item: ParsedNewsItem): Promise<ParsedNewsItem> {
    const response = await fetch(item.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-News-Bot/1.0; +https://example.com/bot)',
      },
    });

    if (!response.ok) {
      return {
        ...item,
        title: this.cleanTitle(item.title),
      };
    }

    const html = await response.text();
    return this.extractFromArticleHtml(html, sourceBaseUrl, item.url, item);
  }

  extractFromArticleHtml(
    html: string,
    sourceBaseUrl: string,
    articleUrl: string,
    seed: ParsedNewsItem,
  ): ParsedNewsItem {
    const $ = cheerio.load(html);
    this.removeNoise($);

    const title =
      this.cleanTitle(
        $('meta[property="og:title"]').attr('content') ||
          $('h1').first().text() ||
          $('title').text() ||
          seed.title,
      ) || seed.title;

    const contentRoot = this.findContentRoot($, articleUrl);
    const bodyText = contentRoot ? this.extractBodyText(contentRoot) : null;
    const excerpt =
      this.normalizeText(
        $('meta[name="description"]').attr('content') ||
          contentRoot?.find('p').first().text() ||
          seed.excerpt ||
          seed.content ||
          null,
      ) || null;
    const imageUrl =
      this.resolveUrl(
        sourceBaseUrl,
        $('meta[property="og:image"]').attr('content') ||
          contentRoot?.find('img').first().attr('src') ||
          contentRoot?.find('img').first().attr('data-src') ||
          seed.imageUrl ||
          null,
      ) || seed.imageUrl;

    return {
      ...seed,
      title,
      content: bodyText || excerpt || seed.content,
      excerpt,
      imageUrl,
    };
  }

  private findContentRoot($: cheerio.CheerioAPI, articleUrl: string): cheerio.Cheerio<any> | null {
    const hostname = new URL(articleUrl).hostname.replace(/^www\./, '');
    const selectors = this.getSelectorsForHost(hostname);

    for (const selector of selectors) {
      const node = $(selector).first();
      if (node.length && this.normalizeText(node.text()).length > 120) {
        return node;
      }
    }

    const generic = $('article, main').first();
    if (generic.length && this.normalizeText(generic.text()).length > 120) {
      return generic;
    }

    return null;
  }

  private getSelectorsForHost(hostname: string): string[] {
    if (hostname.includes('kun.uz')) {
      return [
        '.news-inner__content',
        '.single-content',
        '.content-wrapper',
        '[class*="news-content"]',
      ];
    }

    if (hostname.includes('qalampir.uz')) {
      return [
        '.news-content',
        '.single-post-content',
        '.article-content',
        '[class*="content"]',
      ];
    }

    if (hostname.includes('zamon.uz')) {
      return [
        '.news-content',
        '.entry-content',
        '.article-content',
        '[class*="content"]',
      ];
    }

    return [
      '.news-content',
      '.article-content',
      '.entry-content',
      '[class*="content"]',
    ];
  }

  private extractBodyText(root: cheerio.Cheerio<any>): string | null {
    const paragraphs = root
      .find('p')
      .toArray()
      .map((element) => this.normalizeText(cheerio.load(element).text()))
      .filter((text) => text.length > 20);

    if (paragraphs.length > 0) {
      return paragraphs.join('\n\n');
    }

    const text = this.normalizeText(root.text());
    return text.length > 40 ? text : null;
  }

  private removeNoise($: cheerio.CheerioAPI): void {
    $(
      [
        'script',
        'style',
        'noscript',
        'iframe',
        'svg',
        'form',
        'button',
        'aside',
        'nav',
        'footer',
        '.advertisement',
        '.ads',
        '.ad',
        '.banner',
        '.social',
        '.share',
        '.related',
        '.tags',
        '.comment',
        '[class*="advert"]',
        '[class*="banner"]',
        '[class*="share"]',
        '[class*="social"]',
        '[class*="comment"]',
      ].join(','),
    ).remove();
  }

  private cleanTitle(title: string | null): string {
    const normalized = this.normalizeText(title);

    return normalized
      .replace(/^\d{1,2}:\d{2}\s*[-–—]?\s*/u, '')
      .replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}\s*[-–—]?\s*/u, '')
      .replace(/\s*[-–—]\s*\d{1,2}:\d{2}$/u, '')
      .replace(/\s*[-–—]\s*\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}$/u, '')
      .trim();
  }

  private normalizeText(value: string | null | undefined): string {
    return (value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveUrl(baseUrl: string, value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
  }
}
