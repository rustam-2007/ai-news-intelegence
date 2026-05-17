import { Injectable } from '@nestjs/common';

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
  check(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      redis: 'connected',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
