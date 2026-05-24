import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface HealthCheckResult {
  status: string;
  timestamp: string;
  uptime: number;
  database: string;
  redis: string;
  version: string;
  environment: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const database = await this.getDatabaseStatus();
    const redis = this.getRedisStatus();

    return {
      status: database === 'connected' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database,
      redis,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  private async getDatabaseStatus(): Promise<string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private getRedisStatus(): string {
    return 'not_configured';
  }
}
