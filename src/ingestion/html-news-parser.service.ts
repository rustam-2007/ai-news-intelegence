import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface ParsedNewsItem {
  title: string;
  url: string;
  content: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
}

@Injectable()
export class HtmlNewsParserService {
  async parseLatestPage(url: string, baseUrl: string): Promise<ParsedNewsItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-News-Bot/1.0; +https://example.com/bot)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTML latest page request failed with status ${response.status}`);
    }

    const html = await response.text();
    return this.parseHtml(html, baseUrl);
  }

  parseHtml(html: string, baseUrl: string): ParsedNewsItem[] {
    const $ = cheerio.load(html);
    const seenUrls = new Set<string>();
    const items: ParsedNewsItem[] = [];

    $('a[href]').each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr('href');
      if (!href) {
        return;
      }

      const absoluteUrl = new URL(href, baseUrl).toString();
      if (!this.isLikelyNewsUrl(absoluteUrl)) {
        return;
      }

      if (seenUrls.has(absoluteUrl)) {
        return;
      }

      const container = anchor.closest('article, li, .news-card, .news-item, .card, .item, div');
      const title = this.extractTitle(anchor, container);
      if (!title) {
        return;
      }

      const excerpt = this.extractExcerpt(anchor, container, title);
      const publishedAt = this.extractPublishedAt(anchor, container);
      const imageUrl = this.extractImageUrl(anchor, container, baseUrl);

      seenUrls.add(absoluteUrl);
      items.push({
        title,
        url: absoluteUrl,
        content: excerpt,
        excerpt,
        publishedAt,
        imageUrl,
      });
    });

    return items;
  }

  private isLikelyNewsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return /\/uz\/news(\/|$)/.test(parsed.pathname) || /\/uz\/\d{4}\/\d{2}\/\d{2}\//.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  private extractTitle(anchor: cheerio.Cheerio<any>, container: cheerio.Cheerio<any>): string | null {
    const titleCandidate =
      container.find('h1, h2, h3, h4').first().text().trim() ||
      anchor.find('h1, h2, h3, h4').first().text().trim();

    if (titleCandidate) {
      return titleCandidate;
    }

    const parsed = this.parseAnchorText(anchor.text());
    return parsed.title;
  }

  private extractExcerpt(
    anchor: cheerio.Cheerio<any>,
    container: cheerio.Cheerio<any>,
    title: string,
  ): string | null {
    const excerptCandidate =
      container.find('p').first().text().trim() ||
      anchor.find('p').first().text().trim();

    if (excerptCandidate && excerptCandidate !== title) {
      return excerptCandidate;
    }

    const parsed = this.parseAnchorText(anchor.text());
    if (!parsed.excerpt || parsed.excerpt === title) {
      return null;
    }

    return parsed.excerpt;
  }

  private extractPublishedAt(anchor: cheerio.Cheerio<any>, container: cheerio.Cheerio<any>): Date | null {
    const dateCandidate =
      container.find('time').first().attr('datetime') ||
      container.find('time').first().text().trim() ||
      anchor.find('time').first().attr('datetime') ||
      anchor.find('time').first().text().trim() ||
      this.parseAnchorText(anchor.text()).dateText;

    if (!dateCandidate) {
      return null;
    }

    return this.parseDate(dateCandidate);
  }

  private extractImageUrl(
    anchor: cheerio.Cheerio<any>,
    container: cheerio.Cheerio<any>,
    baseUrl: string,
  ): string | null {
    const imageSrc =
      container.find('img').first().attr('src') ||
      container.find('img').first().attr('data-src') ||
      anchor.find('img').first().attr('src') ||
      anchor.find('img').first().attr('data-src');

    if (!imageSrc) {
      return null;
    }

    return new URL(imageSrc, baseUrl).toString();
  }

  private parseAnchorText(rawText: string): { title: string | null; excerpt: string | null; dateText: string | null } {
    const normalized = rawText.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return { title: null, excerpt: null, dateText: null };
    }

    let remaining = normalized;
    let dateText: string | null = null;

    const fullDateMatch = remaining.match(/^(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})\s+(.*)$/);
    if (fullDateMatch) {
      dateText = fullDateMatch[1];
      remaining = fullDateMatch[2];
    } else {
      const timeOnlyMatch = remaining.match(/^(\d{2}:\d{2})\s+(.*)$/);
      if (timeOnlyMatch) {
        dateText = timeOnlyMatch[1];
        remaining = timeOnlyMatch[2];
      }
    }

    const sentenceParts = remaining
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentenceParts.length >= 2) {
      return {
        title: sentenceParts[0],
        excerpt: sentenceParts.slice(1).join(' '),
        dateText,
      };
    }

    const dashParts = remaining
      .split(/\s[-–—]\s/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (dashParts.length >= 2) {
      return {
        title: dashParts[0],
        excerpt: dashParts.slice(1).join(' '),
        dateText,
      };
    }

    return {
      title: remaining,
      excerpt: null,
      dateText,
    };
  }

  private parseDate(value: string): Date | null {
    const trimmed = value.trim();
    const fullDateMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    if (fullDateMatch) {
      const [, day, month, year, hour, minute] = fullDateMatch;
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+05:00`);
    }

    const timeOnlyMatch = trimmed.match(/^(\d{2}):(\d{2})$/);
    if (timeOnlyMatch) {
      const [, hour, minute] = timeOnlyMatch;
      const now = new Date();
      return new Date(
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T${hour}:${minute}:00+05:00`,
      );
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
