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

  async existsByUrl(url: string): Promise<boolean> {
    const article = await this.prisma.article.findUnique({
      where: { url },
      select: { id: true },
    });

    return Boolean(article);
  }
}
