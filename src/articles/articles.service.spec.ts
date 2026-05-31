import { NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: {
    article: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      article: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new ArticlesService(prisma as never);
  });

  it('uses a compact select for article list responses', async () => {
    prisma.article.findMany.mockResolvedValue([
      {
        id: 1,
        sourceId: 2,
        title: 'Test',
        status: 'APPROVED',
        category: 'jamiyat',
        publishedAt: new Date('2026-05-30T10:00:00.000Z'),
        createdAt: new Date('2026-05-30T09:00:00.000Z'),
        processedAt: new Date('2026-05-30T09:30:00.000Z'),
        telegramMessageId: null,
        facebookPostId: null,
        facebookPostedAt: null,
        facebookPostError: null,
        facebookPostRetryCount: 0,
        facebookCrosspostStatus: null,
        instagramPostId: null,
        instagramPostedAt: null,
        instagramPostError: null,
        instagramPostRetryCount: 0,
        instagramCrosspostStatus: null,
        publishError: null,
      },
    ]);

    await service.findAll();

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          sourceId: true,
          title: true,
          status: true,
          category: true,
          publishedAt: true,
          createdAt: true,
          processedAt: true,
          telegramMessageId: true,
          facebookPostId: true,
          facebookPostedAt: true,
          facebookPostError: true,
          facebookPostRetryCount: true,
          facebookCrosspostStatus: true,
          instagramPostId: true,
          instagramPostedAt: true,
          instagramPostError: true,
          instagramPostRetryCount: true,
          instagramCrosspostStatus: true,
          publishError: true,
        },
      }),
    );
  });

  it('keeps detail lookup returning the full article record', async () => {
    const article = {
      id: 7,
      title: 'Detail',
      content: 'Full content',
      aiRawResponse: '{"raw":true}',
    };
    prisma.article.findUnique.mockResolvedValue(article);

    await expect(service.findOne(7)).resolves.toBe(article);
    expect(prisma.article.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
  });

  it('throws when detail article does not exist', async () => {
    prisma.article.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries newest approved articles first for auto-publish', async () => {
    prisma.article.findMany.mockResolvedValue([]);

    await service.findNewForPublishing(10);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          telegramMessageId: null,
        }),
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
    );
  });

  it('counts published articles within a day range', async () => {
    prisma.article.count.mockResolvedValue(4);
    const start = new Date('2026-05-29T19:00:00.000Z');
    const end = new Date('2026-05-30T19:00:00.000Z');

    await expect(service.countPublishedBetween(start, end)).resolves.toBe(4);

    expect(prisma.article.count).toHaveBeenCalledWith({
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
  });

  it('selects backfill candidates that are published to telegram but not yet posted to facebook', async () => {
    prisma.article.findMany.mockResolvedValue([]);

    await service.findFacebookBackfillCandidates(1);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          telegramMessageId: {
            not: null,
          },
          facebookPostId: null,
          OR: [{ facebookCrosspostStatus: null }, { facebookCrosspostStatus: { not: 'POSTED' } }],
        },
        take: 1,
      }),
    );
  });

  it('limits retry candidates by facebook retry count', async () => {
    prisma.article.findMany.mockResolvedValue([]);

    await service.findFailedFacebookCrosspostCandidates(1, 3);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          facebookCrosspostStatus: 'FAILED',
          facebookPostRetryCount: {
            lt: 3,
          },
        }),
        take: 1,
      }),
    );
  });

  it('selects backfill candidates that are published to telegram but not yet posted to instagram', async () => {
    prisma.article.findMany.mockResolvedValue([]);

    await service.findInstagramBackfillCandidates(1);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          telegramMessageId: {
            not: null,
          },
          instagramPostId: null,
          OR: [{ instagramCrosspostStatus: null }, { instagramCrosspostStatus: { not: 'POSTED' } }],
        },
        take: 1,
      }),
    );
  });

  it('limits retry candidates by instagram retry count', async () => {
    prisma.article.findMany.mockResolvedValue([]);

    await service.findFailedInstagramCrosspostCandidates(1, 3);

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instagramCrosspostStatus: 'FAILED',
          instagramPostRetryCount: {
            lt: 3,
          },
        }),
        take: 1,
      }),
    );
  });
});
