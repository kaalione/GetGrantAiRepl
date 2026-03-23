# getgrant.ai - AI-Powered Swedish Grant Application Platform

getgrant.ai is an AI-powered platform designed to help Swedish businesses discover, match with, and apply for grants and funding opportunities.

## Features

- **Grant Discovery**: Browse Swedish grants from Vinnova, Tillväxtverket, EU, and foundations
- **Smart Matching**: AI-powered matching based on company profile
- **AI Application Generation**: Claude AI generates application content in Swedish
- **Automated Updates**: Scheduled scraping and email notifications
- **Admin Dashboard**: Manage scraper sources and view logs

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express.js 5, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Anthropic Claude (via Replit AI Integrations)
- **Email**: Resend (via Replit connection)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (provided by Replit)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Push database schema:
   ```bash
   npm run db:push
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-configured on Replit) |
| `SESSION_SECRET` | Secret for session encryption |
| `CRON_API_KEY` | API key for authenticating cron endpoints |

### Replit Integrations (Auto-configured)

| Variable | Description |
|----------|-------------|
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic API base URL |

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   └── lib/            # Utilities
│   └── public/             # Static assets
├── server/                 # Express backend
│   ├── lib/                # Server utilities (claude, notifications)
│   ├── middleware/         # Express middleware
│   ├── routes.ts           # API routes
│   └── storage.ts          # Database layer
├── shared/                 # Shared types and schema
│   └── schema.ts           # Drizzle database schema
└── scrapers/               # Python scraper service
    ├── sources/            # Scraper implementations
    └── utils/              # Database and API utilities
```

## Adding New Scraper Sources

1. **Via Admin UI**:
   - Navigate to `/admin/sources/new`
   - Fill in source details (name, type, URL, selectors)
   - Set scraping frequency (daily/weekly)
   - Enable the source

2. **Via Python**:
   - Create a new scraper in `scrapers/sources/`
   - Extend `GenericScraper` class
   - Register in `main.py`

### Scraper Configuration

```python
{
    "name": "Source Name",
    "source_type": "vinnova|tillvaxtverket|eu|stiftelser",
    "base_url": "https://example.com/grants",
    "scraper_type": "static|dynamic",  # static = BeautifulSoup, dynamic = Playwright
    "selectors": {
        "list_selector": ".grant-list .grant-item",
        "title": ".grant-title",
        "description": ".grant-description",
        "deadline": ".grant-deadline",
        "amount": ".grant-amount"
    }
}
```

## API Endpoints

### Grants
- `GET /api/grants` - List grants with filters
- `GET /api/grants/:id` - Get grant details
- `POST /api/grants` - Create grant
- `PUT /api/grants/:id` - Update grant

### Companies
- `GET /api/companies` - List companies
- `POST /api/companies` - Create company profile
- `PUT /api/companies/:id` - Update company

### Applications
- `GET /api/applications` - List applications
- `POST /api/applications/generate` - Generate AI application

### Cron Endpoints
- `POST /api/cron/scrape` - Run scrapers (requires CRON_API_KEY)
- `POST /api/cron/notifications` - Send notifications (requires CRON_API_KEY)

## Automation Setup

To set up automated scraping and notifications:

1. Set `CRON_API_KEY` in environment secrets
2. Use an external cron service (e.g., cron-job.org):

**Daily Scraper Run**:
```json
POST /api/cron/scrape
{
    "frequency": "daily",
    "apiKey": "your-cron-api-key"
}
```

**Email Notifications**:
```json
POST /api/cron/notifications
{
    "apiKey": "your-cron-api-key"
}
```

## Security

- Rate limiting on all API routes (200 requests/15 min)
- Stricter rate limiting on AI generation (20/hour)
- CORS configured for allowed origins
- Cron endpoints require API key authentication
- Input validation with Zod schemas

## License

MIT
