# Facebook Cross-Post via n8n

Architecture:
`AI News API -> Telegram -> n8n webhook -> Facebook Page`

This integration uses `n8n` as the bridge between the NestJS backend and the Meta Graph API. The reliable automation path is a Facebook Page post, not a personal Facebook profile post. If you only have a personal profile, create or use a Facebook Page and generate a Page access token for automation.

## Why a Facebook Page

Meta supports automated publishing through the Graph API for Pages with the right permissions and tokens. Personal profile auto-posting is not the recommended path and should not be relied on for production automation.

## Required API env vars

Backend `.env`:

```env
AUTO_PUBLISH_ENABLED=true
TELEGRAM_PUBLISHING_ENABLED=true
TELEGRAM_DAILY_PUBLISH_LIMIT=10
AUTO_PUBLISH_MAX_PER_RUN=1
AUTO_PUBLISH_FRESH_HOURS=24
AI_PROCESSING_ENABLED=true
AI_DAILY_PROCESS_LIMIT=10
AI_PROCESS_MAX_PER_RUN=1
AI_PROCESS_FRESH_HOURS=24
FACEBOOK_CROSSPOST_ENABLED=true
FACEBOOK_CROSSPOST_PROVIDER=n8n
N8N_FACEBOOK_WEBHOOK_URL=https://n8n.patirstudy.uz/webhook/facebook-crosspost
N8N_FACEBOOK_WEBHOOK_SECRET=<shared-secret>
FACEBOOK_BACKFILL_ENABLED=false
FACEBOOK_BACKFILL_LIMIT=1
FACEBOOK_CROSSPOST_MAX_RETRY_COUNT=3
FACEBOOK_CROSSPOST_MAX_PER_RUN=1
FACEBOOK_CROSSPOST_DAILY_LIMIT=10
```

n8n environment or credentials:

```env
FACEBOOK_API_VERSION=v20.0
FACEBOOK_PAGE_ID=<page-id>
FACEBOOK_PAGE_ACCESS_TOKEN=<page-access-token>
N8N_FACEBOOK_WEBHOOK_SECRET=<same-shared-secret>
```

Do not store real tokens or secrets in the repository.

## Facebook Page setup

1. Create or select a Facebook Page that will own the posts.
2. In Meta for Developers, create an app with the permissions needed for Page publishing.
3. Generate a user access token with the required Page permissions, then exchange it for a Page access token.
4. Retrieve the Facebook Page ID from Meta Business settings, Graph API Explorer, or a Page details lookup.
5. Store the Page ID and Page access token in n8n, not in the Git repository.

## Import the n8n workflow

Workflow file:
`n8n/facebook-crosspost.workflow.json`

1. Open `https://n8n.patirstudy.uz`.
2. Import `n8n/facebook-crosspost.workflow.json`.
3. Confirm the webhook path is `facebook-crosspost`.
4. Set `FACEBOOK_API_VERSION`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, and `N8N_FACEBOOK_WEBHOOK_SECRET` in n8n.
5. Activate the workflow after validation.

Webhook URL expected by the backend:

```text
https://n8n.patirstudy.uz/webhook/facebook-crosspost
```

The backend sends `X-N8N-Webhook-Secret` and n8n validates it before calling Meta Graph API.

## Message and payload contract

The backend posts this event to n8n after Telegram succeeds:

```json
{
  "event": "article.published.telegram",
  "article": {
    "id": 123,
    "sourceId": 1,
    "sourceName": "Kun",
    "title": "...",
    "rewrittenTitleUz": "...",
    "summaryUz": "...",
    "excerpt": "...",
    "url": "...",
    "imageUrl": "...",
    "category": "...",
    "publishedAt": "...",
    "processedAt": "...",
    "telegramMessageId": "..."
  },
  "facebook": {
    "dedupeKey": "article-123",
    "message": "...",
    "link": "..."
  }
}
```

Message format:

```text
<rewrittenTitleUz or title>

<concise summaryUz/excerpt>

Manba: <sourceName>
Batafsil: <article.url>
```

## Backfill existing Telegram posts

The endpoint selects:

- `status = PUBLISHED`
- `telegramMessageId is not null`
- `facebookPostId is null`
- `facebookCrosspostStatus is null or != POSTED`

Start with limit `1`:

```bash
curl -X POST "http://localhost:3000/articles/backfill-facebook?limit=1"
```

If `FACEBOOK_BACKFILL_ENABLED=false`, temporarily switch it to `true` for controlled verification.

## Retry failed Facebook cross-posts

The retry endpoint selects:

- `status = PUBLISHED`
- `telegramMessageId is not null`
- `facebookPostId is null`
- `facebookCrosspostStatus = FAILED`
- `facebookPostRetryCount < FACEBOOK_CROSSPOST_MAX_RETRY_COUNT`

Run:

```bash
curl -X POST "http://localhost:3000/articles/retry-facebook-crosspost"
```

## Verification

Check the debug endpoint:

```bash
curl "http://localhost:3000/debug/pipeline"
```

Look for the `facebook` section:

- `crosspostEnabled`
- `provider`
- `webhookConfigured`
- `latestAttempt`
- `counts`

Check one article in the DB or API and confirm:

- `facebookPostId`
- `facebookCrosspostStatus`
- `facebookPostedAt`
- `facebookPostError`
- `facebookPostRetryCount`

## Troubleshooting

- `token invalid`: regenerate the Facebook Page access token and update n8n.
- `permission denied`: confirm the Meta app has the required Page publishing permissions and the token belongs to a user with Page access.
- `page access token expired`: issue a new Page token and restart or refresh n8n configuration as needed.
- `n8n webhook unavailable`: verify `https://n8n.patirstudy.uz/webhook/facebook-crosspost` is reachable and the workflow is active.
- `duplicate prevention`: the backend does not call n8n again when `facebookPostId` exists or `facebookCrosspostStatus=POSTED`.
