# Automated Content Pipeline

Production-oriented design for generating, persisting, and publishing finance content with AI and Google Blogger. The repository currently contains an early Node.js implementation of the content-generation and Blogger integration pieces, together with the target architecture described in the system design assessment.

## Contents

- [Purpose](#purpose)
- [Target architecture](#target-architecture)
- [Current implementation](#current-implementation)
- [Repository layout](#repository-layout)
- [Configuration](#configuration)
- [Local setup](#local-setup)
- [Google OAuth setup](#google-oauth-setup)
- [Pipeline behavior](#pipeline-behavior)
- [Reliability and security](#reliability-and-security)
- [Quality gates](#quality-gates)
- [Roadmap](#roadmap)

## Purpose

The system is intended to automate a controlled content workflow:

1. Accept or create a content request.
2. Generate a structured article with an LLM.
3. Validate and persist the article and its processing state.
4. Publish approved content to one or more channels.
5. Retry transient failures without creating duplicate content.
6. Expose enough logs and state to investigate failed work.

The design is deliberately asynchronous. Producers should not wait for expensive AI, media, or publishing operations, and traffic spikes should be absorbed by durable queues rather than taking down the API.

## Target architecture

```text
Sources (webhooks, REST, S3 uploads)
				  |
				  v
API gateway / load balancer
(authentication, validation, rate limiting)
				  |
				  v
Message broker (Kafka or RabbitMQ)
				  |
				  v
Pipeline orchestrator (Temporal, Celery, or Airflow)
	   |                 |                 |
	   v                 v                 v
Ingestion workers   Processing workers   Enrichment workers
					(OCR, LLM, media)    (tags, entities, embeddings)
	   |                 |                 |
	   +-----------------+-----------------+
						 |
						 v
PostgreSQL/JSONB + vector index + Redis cache
						 |
						 v
Publishing adapters and CDN delivery
```

### Main stages

- **Ingestion and validation:** Verify webhook signatures, validate schemas, sanitize payloads, and assign an idempotency key.
- **Asynchronous dispatch:** Publish durable events and use consumer backpressure to protect downstream services.
- **Processing and enrichment:** Run summarization, tagging, entity extraction, embeddings, OCR, or transcoding in independent workers.
- **Persistence and caching:** Keep authoritative workflow state in PostgreSQL, store raw or large assets in S3/MinIO, use pgvector or Milvus for semantic retrieval, and use Redis for short-lived state, rate limits, and distributed locks.
- **Publishing and distribution:** Send approved content through channel-specific adapters and deliver public assets through a CDN where appropriate.

## Current implementation

The checked-in code is a Node.js proof of concept rather than the complete production architecture above.

Implemented building blocks:

- `src/services/aiService.js` uses Gemini to request a JSON article, checks existing titles, and creates a `PENDING` article record.
- `src/services/bloggerService.js` publishes an article through the Blogger v3 API.
- `src/config/googleAuth.js` creates a reusable Google OAuth2 client.
- `src/config/db.js` connects to MongoDB through Mongoose.
- `src/scripts/getRefreshToken.js` performs the interactive OAuth flow needed to obtain a Blogger refresh token.
- `src/index.js` boots a database connection, runs a publishing job, and schedules hourly executions.

The current snapshot still references `src/jobs/publisherJob.js` and `src/models/Article.js`, but those modules are not present in the repository. Consequently, the application is not runnable end to end until the publisher job and article model are restored or implemented. The production target in the assessment also calls for PostgreSQL, a message broker, object storage, vector indexing, Redis, API authentication, and automated tests; those are design requirements and are not yet represented by the current source tree.

## Repository layout

```text
.
├── .env.example             # Local configuration template
├── package.json             # Node.js scripts and dependencies
├── package-lock.json        # Reproducible dependency lockfile
└── src/
	├── config/              # Database and Google authentication setup
	├── scripts/             # One-off operational scripts
	├── services/            # AI generation and Blogger publishing adapters
	└── index.js             # Application bootstrap and hourly scheduler
```

The assessment PDF and local dependency installation are intentionally not part of the runtime repository. The architecture requirements are captured here so the repository remains self-documenting.

## Configuration

Copy the template and replace every placeholder with a real value:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `PORT` | Local OAuth callback port. |
| `MONGODB_URI` | MongoDB connection string used by the current proof of concept. |
| `GEMINI_API_KEY` | Google Gemini API key used for article generation. |
| `GOOGLE_CLIENT_ID` | OAuth client ID for the Google project. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret for the Google project. |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL, normally `http://localhost:3000/oauth2callback`. |
| `GOOGLE_REFRESH_TOKEN` | Offline Blogger authorization token. |
| `BLOGGER_BLOG_ID` | Blogger blog ID receiving published posts. |

Never commit `.env`, API keys, OAuth secrets, or refresh tokens. Rotate any credential that has been exposed.

## Local setup

Prerequisites:

- Node.js 20 or newer.
- A reachable MongoDB instance for the current implementation.
- A Gemini API key and Google Cloud OAuth client configured for Blogger.

Install dependencies and configure the environment:

```bash
npm install
cp .env.example .env
```

Obtain a refresh token, then start the application:

```bash
npm run get-token
npm start
```

The scheduler is configured to run at the start of every hour. It also attempts one execution during startup so work missed while the process was offline can be recovered once the missing publisher job and model are available.

## Google OAuth setup

1. Create or select a Google Cloud project.
2. Enable the Blogger API.
3. Create an OAuth client with the redirect URI from `GOOGLE_REDIRECT_URI`.
4. Set the client ID, client secret, and redirect URI in `.env`.
5. Run `npm run get-token`.
6. Open the printed authorization URL and approve Blogger access.
7. Store the printed refresh token as `GOOGLE_REFRESH_TOKEN` in the local `.env`.

The callback server listens on port `3000` and closes after receiving the authorization code.

## Pipeline behavior

The intended article lifecycle is:

```text
REQUESTED -> GENERATING -> PENDING -> PUBLISHED
						 \-> FAILED -> RETRYING
```

The AI service asks Gemini for a title, HTML body, and tags. It supplies existing titles to the model to reduce repetition and performs a second title lookup before creating the article. The publishing adapter maps the stored title, body, and tags to Blogger's post API.

For production, each transition should be persisted transactionally and accompanied by an event ID. A worker must be able to receive the same event more than once without publishing duplicate content.

## Reliability and security

The assessment requires the following controls as the system grows:

- Exponential retry with a bounded attempt count, followed by a dead-letter queue for manual inspection.
- Content hashes and idempotency keys for ingestion, processing, and publishing.
- Schema validation, input sanitization, webhook signature verification, and strict authorization at the API boundary.
- Parameterized database queries and isolated secret management.
- Redis-backed rate limiting and distributed locks where multiple workers can claim the same work.
- Structured JSON logs, correlation IDs, OpenTelemetry traces, and Prometheus/Grafana-compatible metrics.
- Separate raw asset storage from relational metadata, with least-privilege access to each service.

## Quality gates

The current package does not yet define automated test, lint, or type-check scripts. Before calling this production-ready, add unit tests for generation, duplicate detection, state transitions, OAuth configuration, and Blogger failures, plus integration tests against disposable infrastructure. The assessment's intended checks are:

```bash
pytest --cov=src --cov-report=term-missing
mypy src/
bandit -r src/
```

Those commands apply to the assessment's planned Python service layout and are not currently executable against this Node.js proof of concept.

## Roadmap

1. Restore or implement the `Article` model and `publisherJob` workflow referenced by the bootstrap and AI service.
2. Add explicit article state transitions, retries, idempotency, and failure persistence.
3. Separate the scheduler from worker execution and introduce a durable broker.
4. Move authoritative workflow state to PostgreSQL with migrations; add Redis, object storage, and vector indexing.
5. Add authenticated ingestion endpoints, channel adapters, observability, CI, and security scanning.
6. Add unit, integration, and load tests before enabling unattended publishing.

## License

This project is licensed under the [MIT License](LICENSE). See the license file for the full terms.