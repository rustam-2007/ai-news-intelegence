import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService } from '../ai/openai.service';
import { ArticlesService } from '../articles/articles.service';
import { FacebookCrosspostService } from '../facebook-crosspost/facebook-crosspost.service';
import { SourcesService } from '../sources/sources.service';
import { TelegramService } from '../telegram/telegram.service';
import { DebugController } from './debug.controller';

describe('DebugController', () => {
  let controller: DebugController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebugController],
      providers: [
        {
          provide: SourcesService,
          useValue: {
            findAllWithLatestArticle: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ArticlesService,
          useValue: {
            getStatusCounts: jest.fn().mockResolvedValue([]),
            findLatestPublishAttempt: jest.fn().mockResolvedValue(null),
            findLatestFacebookAttempt: jest.fn().mockResolvedValue({
              id: 12,
              title: 'AI News',
              facebookCrosspostStatus: 'POSTED',
              facebookPostId: 'fb_12',
              facebookPostError: null,
              facebookPostedAt: new Date('2026-05-30T12:00:00.000Z'),
            }),
            getFacebookCounts: jest.fn().mockResolvedValue({
              telegramPublishedOnly: 2,
              facebookPosted: 8,
              facebookFailed: 1,
            }),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            getConfigStatus: jest.fn().mockReturnValue({
              botTokenConfigured: true,
              channelConfigured: true,
            }),
          },
        },
        {
          provide: FacebookCrosspostService,
          useValue: {
            getConfigStatus: jest.fn().mockReturnValue({
              crosspostEnabled: true,
              provider: 'n8n',
              webhookConfigured: true,
            }),
          },
        },
        {
          provide: OpenAiService,
          useValue: {
            getConfigStatus: jest.fn().mockReturnValue({
              apiKeyConfigured: true,
              model: 'gpt-5.4-mini',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<DebugController>(DebugController);
  });

  it('includes facebook status without exposing secrets', async () => {
    const result = await controller.getPipelineStatus();

    expect(result.facebook).toEqual({
      crosspostEnabled: true,
      provider: 'n8n',
      webhookConfigured: true,
      latestAttempt: {
        articleId: 12,
        title: 'AI News',
        status: 'POSTED',
        facebookPostId: 'fb_12',
        facebookPostError: null,
        facebookPostedAt: new Date('2026-05-30T12:00:00.000Z'),
      },
      counts: {
        telegramPublishedOnly: 2,
        facebookPosted: 8,
        facebookFailed: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain('N8N_FACEBOOK_WEBHOOK_SECRET');
    expect(JSON.stringify(result)).not.toContain('FACEBOOK_PAGE_ACCESS_TOKEN');
  });
});
