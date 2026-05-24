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
      return this.cleanTitle(titleCandidate);
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
      return this.cleanExcerpt(excerptCandidate, title);
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
      this.extractSrcsetUrl(container.find('img').first().attr('srcset') || null) ||
      container.find('img').first().attr('src') ||
      container.find('img').first().attr('data-src') ||
      this.extractSrcsetUrl(anchor.find('img').first().attr('srcset') || null) ||
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
      const title = this.cleanTitle(sentenceParts[0]);
      return {
        title,
        excerpt: this.cleanExcerpt(sentenceParts.slice(1).join(' '), title),
        dateText,
      };
    }

    const dashParts = remaining
      .split(/\s[-–—]\s/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (dashParts.length >= 2) {
      const title = this.cleanTitle(dashParts[0]);
      return {
        title,
        excerpt: this.cleanExcerpt(dashParts.slice(1).join(' '), title),
        dateText,
      };
    }

    return {
      title: this.cleanTitle(remaining),
      excerpt: null,
      dateText,
    };
  }

  private cleanTitle(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    const withoutTimestamp = normalized
      .replace(/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s*/u, '')
      .replace(/^\d{2}:\d{2}\s*/u, '')
      .trim();

    return this.removeMergedPreview(this.removeDuplicatedHeadline(withoutTimestamp));
  }

  private cleanExcerpt(value: string, title: string): string | null {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const withoutTimestamp = normalized
      .replace(/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s*/u, '')
      .replace(/^\d{2}:\d{2}\s*/u, '')
      .trim();
    const withoutLeadingTitle = withoutTimestamp.startsWith(title)
      ? withoutTimestamp.slice(title.length).replace(/^[:\-–—.\s]+/u, '').trim()
      : withoutTimestamp;

    return withoutLeadingTitle && withoutLeadingTitle !== title ? withoutLeadingTitle : null;
  }

  private extractSrcsetUrl(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const candidates = value
      .split(',')
      .map((entry) => entry.trim().split(/\s+/u)[0])
      .filter(Boolean);

    return candidates[candidates.length - 1] ?? null;
  }

  private removeDuplicatedHeadline(title: string): string {
    const parts = title
      .split(/\s[-–—|]\s/u)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
      return parts[0];
    }

    const repeatedHalf = title.match(/^(.{15,}?)\s+\1$/u);
    if (repeatedHalf) {
      return repeatedHalf[1].trim();
    }

    const repeatedLeadingPhrase = title.match(/^(.{10,}?)\s+\1(?=[.!?]|$)/u);
    if (repeatedLeadingPhrase) {
      return repeatedLeadingPhrase[1].trim();
    }

    return title;
  }

  private removeMergedPreview(title: string): string {
    const sentenceParts = title
      .split(/(?<=[.!?])\s+/u)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentenceParts.length > 1) {
      return sentenceParts[0];
    }

    const previewMarkers = [' Batafsil', ' Davomi', ' Foto', ' Video'];
    for (const marker of previewMarkers) {
      const index = title.indexOf(marker);
      if (index > 20) {
        return title.slice(0, index).trim();
      }
    }

    return title;
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
