import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { SourceIngestionService } from '../ingestion/source-ingestion.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { FetchSourcesQueryDto } from './dto/fetch-sources-query.dto';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly sourceIngestionService: SourceIngestionService,
  ) {}

  @Post()
  create(@Body() createSourceDto: CreateSourceDto) {
    return this.sourcesService.create(createSourceDto);
  }

  @Get()
  findAll() {
    return this.sourcesService.findAll();
  }

  @Post('fetch-all')
  fetchAll(@Query() query: FetchSourcesQueryDto) {
    return this.sourceIngestionService.fetchActiveSources(query);
  }

  @Post(':id/fetch')
  fetchById(@Param('id', ParseIntPipe) id: number, @Query() query: FetchSourcesQueryDto) {
    return this.sourceIngestionService.fetchSourceById(id, query);
  }
}
