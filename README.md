# Trainer

A mobile-first web app for tracking and planning gym sessions. Built with SvelteKit, TypeScript, and Tailwind CSS, backed by Azure Table Storage.

## Features

- **Plan screen** — View your weekly training plan, mark exercises complete with actual weight/reps
- **History screen** — Browse exercise history by date, track bodyweight trends with a chart
- **AI summary** — Weekly progress summary (mock provider, ready to swap for a real AI service)

## Tech Stack

- SvelteKit 2 (Svelte 5) + Vite+
- TypeScript
- Tailwind CSS 4 + daisyUI 5
- Azure Table Storage
- Azure OpenAI (gpt-4o-mini)
- Chart.js (weight trend chart)
- Vitest (unit tests)
- Azure Static Web Apps (deployment)

## Prerequisites

- [Vite+](https://viteplus.dev/) (`curl -fsSL https://vite.plus | bash`)
- [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) for local Table Storage emulation

## Getting Started

```bash
# Install dependencies
vp pm install

# Copy env template and configure
cp .env.example .env

# Start Azurite (in another terminal)
azurite --silent --location .azurite --debug .azurite/debug.log

# Seed the database with sample data
vp run seed

# Start dev server
vp dev
```

Open [http://localhost:5173](http://localhost:5173) on your phone or in a mobile-width browser.

## Scripts

| Command          | Description                               |
| ---------------- | ----------------------------------------- |
| `vp dev`         | Start dev server                          |
| `vp build`       | Production build                          |
| `vp preview`     | Preview production build                  |
| `vp test --run`  | Run unit tests                            |
| `vp test`        | Run tests in watch mode                   |
| `vp run check`   | Type-check with svelte-check              |
| `vp run seed`    | Seed Azure Table Storage with sample data |

## Project Structure

```
src/
├── lib/
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Date helpers
│   ├── services/       # Table storage, plan, exercise, summary services
│   └── components/     # Svelte components
├── routes/
│   ├── api/            # API routes (plans, exercises, weight, summary)
│   ├── data/           # Data API routes
│   ├── history/        # History page
│   └── +page.svelte    # Plan page (home)
├── app.html
├── app.css
└── app.d.ts
scripts/
└── seed.ts             # Database seed script
tests/
├── utils/              # Utility tests
└── services/           # Service tests
```

## Deployment

The app is configured for Azure Static Web Apps via `svelte-adapter-azure-swa`.

1. Create an Azure Static Web App resource
2. Set `AZURE_STORAGE_CONNECTION_STRING` in the SWA environment variables
3. Connect your GitHub repo — the SWA GitHub Action handles CI/CD automatically

## Architecture Notes

- **Service layer** — All data operations go through typed service modules, making it easy to swap storage backends
- **Mock AI** — `summaryService.ts` implements a `SummaryProvider` interface; swap `MockSummaryProvider` for a real implementation when ready
- **No auth** — Single-user app, no authentication layer
