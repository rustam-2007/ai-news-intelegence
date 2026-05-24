import { Injectable, NotFoundException } from '@nestjs/common';
import { Article, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Article[]> {
    return this.prisma.article.findMany({
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

  async findNewForPublishing(limit = 10) {
    return this.prisma.article.findMany({
      where: {
        status: 'APPROVED',
        ingestedViaLatestOnly: true,
      },
      include: {
        source: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  async findNewForProcessing(limit = 10): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: {
        status: 'NEW',
        ingestedViaLatestOnly: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
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
    },
  ): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        status: 'APPROVED',
        rewrittenTitleUz: aiOutput.rewrittenTitleUz,
        summaryUz: aiOutput.summaryUz,
        category: aiOutput.category,
        aiModel: aiOutput.aiModel,
        processedAt: new Date(),
        publishError: null,
      },
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

  async markFailed(id: number, errorMessage: string): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        status: 'FAILED',
        publishError: errorMessage,
        retryCount: {
          increment: 1,
        },
      },
    });
  }

  async resetForReprocess(id: number): Promise<Article> {
    return this.prisma.article.update({
      where: { id },
      data: {
        status: 'NEW',
        publishError: null,
        processedAt: null,
        retryCount: 0,
        telegramMessageId: null,
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
