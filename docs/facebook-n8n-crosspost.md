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

Manual UI import:

1. Open `https://n8n.patirstudy.uz`.
2. Import `n8n/facebook-crosspost.workflow.json`.
3. Confirm the webhook path is `facebook-crosspost`.
4. Set `FACEBOOK_API_VERSION`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, and `N8N_FACEBOOK_WEBHOOK_SECRET` in n8n.
5. Publish the workflow after validation.

Scripted deployment from code:

1. In n8n, create an API key: `Settings -> n8n API -> Create API key`.
2. Export the local deployment env vars:

```env
N8N_BASE_URL=https://n8n.patirstudy.uz
N8N_API_KEY=<n8n-api-key>
N8N_FACEBOOK_WORKFLOW_PATH=n8n/facebook-crosspost.workflow.json
N8N_ACTIVATE_WORKFLOW=true
```

3. Run:

```bash
node scripts/deploy-n8n-facebook-workflow.js
```

Or through `package.json`:

```bash
npm run n8n:deploy:facebook
```

The deployment script:

- validates the workflow JSON before any API call
- never logs `N8N_API_KEY` or `FACEBOOK_PAGE_ACCESS_TOKEN`
- looks up a workflow by name first and updates it instead of creating a duplicate when possible
- can skip the API call with `N8N_DRY_RUN=true`

Dry run example:

```bash
N8N_DRY_RUN=true npm run n8n:deploy:facebook
```

If the n8n public API on your instance rejects workflow updates because of version-specific payload differences, use the manual UI import path above as the fallback and then publish the workflow in the UI.

Webhook URL expected by the backend:

```text
https://n8n.patirstudy.uz/webhook/facebook-crosspost
```

The backend sends `X-N8N-Webhook-Secret` and n8n validates it before calling Meta Graph API.

The workflow JSON is expected to read these values from n8n env or credentials and must not hardcode the secret/token values:

- `FACEBOOK_API_VERSION`
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `N8N_FACEBOOK_WEBHOOK_SECRET`

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

Check workflow status in n8n:

1. Open `https://n8n.patirstudy.uz`.
2. Open the `facebook-crosspost` workflow.
3. Confirm the workflow is published.
4. Confirm the webhook path is still `facebook-crosspost`.

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

Manual webhook test against n8n:

```bash
curl -X POST "https://n8n.patirstudy.uz/webhook/facebook-crosspost" \
  -H "Content-Type: application/json" \
  -H "X-N8N-Webhook-Secret: <same-shared-secret>" \
  -d '{
    "event": "article.published.telegram",
    "article": {
      "id": 123,
      "sourceId": 1,
      "sourceName": "Kun",
      "title": "Test title",
      "rewrittenTitleUz": "Test title",
      "summaryUz": "Test summary",
      "excerpt": "Test excerpt",
      "url": "https://example.com/articles/123",
      "imageUrl": null,
      "category": "news",
      "publishedAt": null,
      "processedAt": null,
      "telegramMessageId": "12345"
    },
    "facebook": {
      "dedupeKey": "article-123",
      "message": "Test title\n\nTest summary\n\nManba: Kun\nBatafsil: https://example.com/articles/123",
      "link": "https://example.com/articles/123"
    }
  }'
```

## Troubleshooting

- `token invalid`: regenerate the Facebook Page access token and update n8n.
- `permission denied`: confirm the Meta app has the required Page publishing permissions and the token belongs to a user with Page access.
- `page access token expired`: issue a new Page token and restart or refresh n8n configuration as needed.
- `n8n webhook unavailable`: verify `https://n8n.patirstudy.uz/webhook/facebook-crosspost` is reachable and the workflow is active.
- `duplicate prevention`: the backend does not call n8n again when `facebookPostId` exists or `facebookCrosspostStatus=POSTED`.
