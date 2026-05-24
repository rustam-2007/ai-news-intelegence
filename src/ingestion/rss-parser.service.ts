import { Injectable } from '@nestjs/common';
import Parser, { Item } from 'rss-parser';

@Injectable()
export class RssParserService {
  private readonly parser = new Parser();

  async parseURL(url: string): Promise<Item[]> {
    const feed = await this.parser.parseURL(url);
    return feed.items ?? [];
  }
}
