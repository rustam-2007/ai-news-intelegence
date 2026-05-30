import { Injectable, NotFoundException } from '@nestjs/common';
import { Article, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const ARTICLE_LIST_SELECT = {
  id: true,
  sourceId: true,
  title: true,
  status: true,
  category: true,
  publishedAt: true,
  createdAt: true,
  processedAt: true,
  telegramMessageId: true,
  publishError: true,
} satisfies Prisma.ArticleSelect;

export type ArticleListItem = Prisma.ArticleGetPayload<{
  select: typeof ARTICLE_LIST_SELECT;
}>;

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ArticleListItem[]> {
    return this.prisma.article.findMany({
      select: ARTICLE_LIST_SELECT,
      orderBy: [
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async create(data: Prisma.ArticleUncheckedCreateInput): Promise<Article> {
    return this.prisma.article.create({ data });
  }

  async findLatestPublishedAtForSource(sourceId: number): Promise<Date | null> {
    const article = await this.prisma.article.findFirst({
      where: {
        sourceId,
        publishedAt: {
          not: null,
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      select: {
        publishedAt: true,
      },
    });

    return article?.publishedAt ?? null;
  }

  async getStatusCounts(): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.article.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    return rows.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }

  async findLatestPublishAttempt() {
    return this.prisma.article.findFirst({
      where: {
        OR: [
          { status: 'PUBLISHED' },
          { status: 'FAILED' },
          { retryCount: { gt: 0 } },
          { telegramMessageId: { not: null } },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        sourceId: true,
        title: true,
        status: true,
        updatedAt: true,
        publishError: true,
        telegramMessageId: true,
        retryCount: true,
      },
    });
  }

  async findOne(id: number): Promise<Article> {
    const article = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    return article;
  }

  async findOneForPublishing(id: number) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        source: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    return article;
  }

  async findOneWithSource(id: number) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        source: true,
      },
    });

    if (!article) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    return article;
  }

  async findNewForPublishing(limit = 10) {
    return this.prisma.article.findMany({
      where: {
        status: 'APPROVED',
        ingestedViaLatestOnly: true,
        telegramMessageId: null,
      },
      include: {
        source: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findNewForProcessing(limit = 10): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: {
        status: 'NEW',
        ingestedViaLatestOnly: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async countPublishedBetween(start: Date, end: Date): Promise<number> {
    return this.prisma.article.count({
      where: {
        status: 'PUBLISHED',
        telegramMessageId: {
          not: null,
        },
        updatedAt: {
          gte: start,
          lt: end,
        },
      },
    });
  }

  async countProcessedBetween(start: Date, end: Date): Promise<number> {
    return this.prisma.article.count({
      where: {
        processedAt: {
          gte: start,
          lt: end,
        },
      },
    });
  }

  async findFailedForReprocessing(limit = 20) {
    return this.prisma.article.findMany({
      where: {
        status: 'FAILED',
      },
      include: {
        source: true,
      },
      orderBy: [
        { updatedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  async markProcessing(id: number): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        publishError: null,
      },
    });
  }

  async markApproved(
    id: number,
    aiOutput: {
      rewrittenTitleUz: string;
      summaryUz: string;
      category: string;
      aiModel: string;
      aiRawResponse?: string | null;
    },
  ): Promise<Article> {
    const data: Prisma.ArticleUpdateInput = {
      status: 'APPROVED',
      rewrittenTitleUz: aiOutput.rewrittenTitleUz,
      summaryUz: aiOutput.summaryUz,
      category: aiOutput.category,
      aiModel: aiOutput.aiModel,
      aiRawResponse: aiOutput.aiRawResponse ?? null,
      processedAt: new Date(),
      publishError: null,
    };

    return this.prisma.article.update({
      where: { id },
      data,
    });
  }

  async markPublished(id: number, telegramMessageId: string): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        telegramMessageId,
        publishError: null,
      },
    });
  }

  async markFailed(id: number, errorMessage: string, options?: { aiRawResponse?: string | null }): Promise<Article> {
    const data: Prisma.ArticleUpdateInput = {
      status: 'FAILED',
      publishError: errorMessage,
      aiRawResponse: options?.aiRawResponse,
      retryCount: {
        increment: 1,
      },
    };

    return this.prisma.article.update({
      where: { id },
      data,
    });
  }

  async resetForReprocess(id: number): Promise<Article> {
    const data: Prisma.ArticleUpdateInput = {
      status: 'NEW',
      publishError: null,
      processedAt: null,
      retryCount: 0,
      telegramMessageId: null,
      aiRawResponse: null,
    };

    return this.prisma.article.update({
      where: { id },
      data,
    });
  }

  async updateExtractedContent(
    id: number,
    data: {
      title: string;
      content: string | null;
      excerpt: string | null;
      imageUrl: string | null;
      contentHash: string;
    },
  ): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        excerpt: data.excerpt,
        imageUrl: data.imageUrl,
        contentHash: data.contentHash,
      },
    });
  }

  async existsByUrl(url: string): Promise<boolean> {
    const article = await this.prisma.article.findUnique({
      where: { url },
      select: { id: true },
    });

    return Boolean(article);
  }
}
