import { Controller, Get } from '@nestjs/common';
import { OpenAiService } from '../ai/openai.service';
import { ArticlesService } from '../articles/articles.service';
import { InstagramCrosspostService } from '../instagram-crosspost/instagram-crosspost.service';
import { SourcesService } from '../sources/sources.service';
import { TelegramService } from '../telegram/telegram.service';

@Controller('debug')
export class DebugController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly articlesService: ArticlesService,
    private readonly telegramService: TelegramService,
    private readonly instagramCrosspostService: InstagramCrosspostService,
    private readonly openAiService: OpenAiService,
  ) {}

  @Get('pipeline')
  async getPipelineStatus() {
    const [sources, articleStatusCounts, latestPublishAttempt, latestInstagramAttempt, instagramCounts] = await Promise.all([
      this.sourcesService.findAllWithLatestArticle(),
      this.articlesService.getStatusCounts(),
      this.articlesService.findLatestPublishAttempt(),
      this.articlesService.findLatestInstagramAttempt(),
      this.articlesService.getInstagramCounts(),
    ]);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Tashkent',
      config: {
        ...this.openAiService.getConfigStatus(),
        telegram: this.telegramService.getConfigStatus(),
      },
      instagram: {
        ...this.instagramCrosspostService.getConfigStatus(),
        latestAttempt: latestInstagramAttempt
          ? {
              articleId: latestInstagramAttempt.id,
              title: latestInstagramAttempt.title,
              status: latestInstagramAttempt.instagramCrosspostStatus,
              instagramPostId: latestInstagramAttempt.instagramPostId,
              instagramPostError: latestInstagramAttempt.instagramPostError,
              instagramPostedAt: latestInstagramAttempt.instagramPostedAt,
            }
          : null,
        counts: instagramCounts,
      },
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        sourceType: source.sourceType,
        baseUrl: source.baseUrl,
        rssUrlConfigured: Boolean(source.rssUrl),
        latestPageUrl: source.latestPageUrl,
        isActive: source.isActive,
        lastFetchedAt: source.lastFetchedAt,
        lastSuccessAt: source.lastSuccessAt,
        lastError: source.lastError,
        latestArticlePublishedAt: source.latestArticlePublishedAt,
        latestArticle: source.articles[0] ?? null,
      })),
      articleStatusCounts,
      latestPublishAttempt,
    };
  }
}
