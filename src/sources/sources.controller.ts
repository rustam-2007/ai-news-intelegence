import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RssIngestionService } from '../ingestion/rss-ingestion.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly rssIngestionService: RssIngestionService,
  ) {}

  @Post()
  create(@Body() createSourceDto: CreateSourceDto) {
    return this.sourcesService.create(createSourceDto);
  }

  @Get()
  findAll() {
    return this.sourcesService.findAll();
  }

  @Post(':id/fetch')
  fetchById(@Param('id', ParseIntPipe) id: number) {
    return this.rssIngestionService.fetchSourceById(id);
  }
}
