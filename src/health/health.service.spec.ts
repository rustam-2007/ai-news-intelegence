import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('returns connected database status when prisma query succeeds', async () => {
    prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
      redis: 'not_configured',
    });
  });

  it('returns disconnected database status when prisma query fails', async () => {
    prismaService.$queryRaw.mockRejectedValue(new Error('db down'));

    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      database: 'disconnected',
      redis: 'not_configured',
    });
  });
});
