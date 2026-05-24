import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Source } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSourceDto: CreateSourceDto): Promise<Source> {
    return this.prisma.source.create({
      data: {
        name: createSourceDto.name.trim(),
        baseUrl: createSourceDto.baseUrl.trim(),
        rssUrl: createSourceDto.rssUrl.trim(),
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
}
