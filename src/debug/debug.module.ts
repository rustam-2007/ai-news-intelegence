import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ArticlesModule } from '../articles/articles.module';
import { SourcesModule } from '../sources/sources.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DebugController } from './debug.controller';

@Module({
  imports: [AiModule, ArticlesModule, SourcesModule, TelegramModule],
  controllers: [DebugController],
})
export class DebugModule {}
