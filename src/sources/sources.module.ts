import { Module, forwardRef } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  imports: [forwardRef(() => IngestionModule)],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
