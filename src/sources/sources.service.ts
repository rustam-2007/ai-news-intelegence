import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Source } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSourceDto: CreateSourceDto): Promise<Source> {
    const sourceType = createSourceDto.sourceType ?? 'RSS';

    return this.prisma.source.create({
      data: {
        name: createSourceDto.name.trim(),
        sourceType,
        baseUrl: createSourceDto.baseUrl.trim(),
        rssUrl: createSourceDto.rssUrl?.trim(),
        latestPageUrl: createSourceDto.latestPageUrl?.trim(),
        isActive: createSourceDto.isActive ?? true,
        fetchIntervalMinutes: createSourceDto.fetchIntervalMinutes ?? 15,
      },
    });
  }

  async findAll(): Promise<Source[]> {
    return this.prisma.source.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findActive(): Promise<Source[]> {
    return this.prisma.source.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findAllWithLatestArticle() {
    return this.prisma.source.findMany({
      orderBy: {
        id: 'asc',
      },
      include: {
        articles: {
          take: 1,
          orderBy: [
            { createdAt: 'desc' },
          ],
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            publishedAt: true,
            publishError: true,
            telegramMessageId: true,
          },
        },
      },
    });
  }

  async findOne(id: number): Promise<Source> {
    const source = await this.prisma.source.findUnique({
      where: { id },
    });

    if (!source) {
      throw new NotFoundException(`Source ${id} not found`);
    }

    return source;
  }

  async update(id: number, data: Prisma.SourceUpdateInput): Promise<Source> {
    await this.findOne(id);

    return this.prisma.source.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<Source> {
    await this.findOne(id);

    return this.prisma.source.delete({
      where: { id },
    });
  }

  async markFetchSuccess(
    id: number,
    data: {
      latestArticlePublishedAt?: Date | null;
    },
  ): Promise<Source> {
    return this.prisma.source.update({
      where: { id },
      data: {
        lastFetchedAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        latestArticlePublishedAt: data.latestArticlePublishedAt ?? undefined,
      },
    });
  }

  async markFetchError(id: number, errorMessage: string): Promise<Source> {
    return this.prisma.source.update({
      where: { id },
      data: {
        lastFetchedAt: new Date(),
        lastError: errorMessage,
      },
    });
  }
}
