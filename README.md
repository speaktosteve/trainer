# Trainer

![CI](https://github.com/speaktosteve/trainer/actions/workflows/ci.yml/badge.svg)
![SvelteKit](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![daisyUI](https://img.shields.io/badge/daisyUI-5-5A0EF8?logo=daisyui&logoColor=white)
![Vite+](https://img.shields.io/badge/Vite+-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![Azure Static Web Apps](https://img.shields.io/badge/Azure_Static_Web_Apps-0078D4?logo=microsoft-azure&logoColor=white)
![Azure Table Storage](https://img.shields.io/badge/Azure_Table_Storage-0078D4?logo=microsoft-azure&logoColor=white)

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

## Getting Started

### Prerequisites

- [Vite+](https://viteplus.dev/) (`curl -fsSL https://vite.plus | bash`)
- [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) for local Table Storage emulation (`npm install -g azurite`)

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required — Azure Table Storage connection
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true  # for local Azurite

# Optional — Azure OpenAI (app works without these, using rule-based fallbacks)
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini  # default if omitted
```

### Run Locally

```bash
# Install dependencies
vp pm install

# Copy env template and configure
cp .env.example .env

# Start Azurite (in another terminal)
azurite --silent --location .azurite --debug .azurite/debug.log

# Seed the database with sample data (6 weeks of progressive overload + bodyweight)
vp run seed

# Start dev server
vp dev
```

Open [http://localhost:5173](http://localhost:5173) on your phone or in a mobile-width browser.

## Scripts

| Command         | Description                               |
| --------------- | ----------------------------------------- |
| `vp dev`        | Start dev server                          |
| `vp build`      | Production build                          |
| `vp preview`    | Preview production build                  |
| `vp test --run` | Run unit tests                            |
| `vp test`       | Run tests in watch mode                   |
| `vp run check`  | Type-check with svelte-check              |
| `vp run seed`   | Seed Azure Table Storage with sample data |

## Project Structure

```
src/
├── lib/
│   ├── types/          # TypeScript interfaces (WeeklyPlan, ExerciseEntry, etc.)
│   ├── utils/          # Date helpers (week boundaries, reverse timestamps)
│   ├── services/       # Table storage, plan, exercise, summary, OpenAI services
│   └── components/     # Svelte 5 components (runes, $state/$derived/$props)
├── routes/
│   ├── data/           # Server-side API routes (plans, exercises, weight, summary)
│   ├── history/        # History page
│   └── +page.svelte    # Plan page (home)
├── app.html
├── app.css
└── app.d.ts
scripts/
└── seed.ts             # Database seed script (6 weeks of sample data)
tests/
├── __mocks__/          # Env mocks for test isolation
├── utils/              # Date utility tests
└── services/           # Service-layer unit tests
```

## Architecture

### API Routes

All server routes live under `/data/` (not `/api/`, which is reserved by Azure Static Web Apps):

| Route                  | Methods           | Purpose                                                                             |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `/data/plans`          | GET, POST, PUT    | Fetch current week plan, create, or update a plan                                   |
| `/data/plans/[weekId]` | GET               | Fetch a specific week's plan by date (e.g. `2026-03-30`)                            |
| `/data/plans/next`     | POST              | Generate next week's plan via AI or rule-based provider                             |
| `/data/exercises`      | GET, POST, DELETE | Query exercise logs (with `?from`, `?to`, `?limit`), log a session, remove an entry |
| `/data/weight`         | GET, POST         | Query bodyweight history, log a new entry                                           |
| `/data/summary`        | GET               | Fetch weekly AI-generated summary                                                   |

### Service Layer

All data operations go through typed service modules in `src/lib/services/`, making it easy to swap storage backends or AI providers.

| Service                    | Responsibility                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tableStorage.ts`          | Thin wrapper around `@azure/data-tables`. Manages three tables (`Plans`, `ExerciseLogs`, `BodyWeight`), creates them on first access. Exports `DEFAULT_PK = "default"` for single-user partitioning.                                            |
| `planService.ts`           | CRUD operations for weekly training plans — fetch current week, fetch by date, upsert, range queries.                                                                                                                                           |
| `exerciseService.ts`       | Exercise log persistence with **merge logic** (same exercise on same date+day overwrites rather than duplicates). Also handles bodyweight logging and history.                                                                                  |
| `summaryService.ts`        | Weekly progress summaries via a `SummaryProvider` interface. Ships with `MockSummaryProvider` (heuristic-based: session counts, bodyweight trends, PR detection, injury notes).                                                                 |
| `openaiClient.ts`          | Azure OpenAI client wrapper. Checks if LLM is configured and caches the client instance.                                                                                                                                                        |
| `planGenerationService.ts` | Next-week plan generation via a `PlanGenerationProvider` interface. Two implementations: `SmartCopyProvider` (rule-based progressive overload) and `LLMPlanProvider` (Azure OpenAI with coaching prompt). Falls back to SmartCopy on LLM error. |

### Azure Table Storage Schema

Single-user design — all data lives under partition key `"default"`. Extend to multi-user by varying the partition key.

| Table            | Partition Key | Row Key                              | Data                                                  |
| ---------------- | ------------- | ------------------------------------ | ----------------------------------------------------- |
| **Plans**        | `"default"`   | ISO week-start date (`"2026-03-30"`) | JSON-serialised `WeeklyPlan`                          |
| **ExerciseLogs** | `"default"`   | `reverseTimestamp(date)_day`         | JSON-serialised `ExerciseLog` with actual weight/reps |
| **BodyWeight**   | `"default"`   | ISO date (`"2026-03-30"`)            | `weight` (number, kg)                                 |

**Reverse timestamp** (`9999999999999 - date.getTime()`) ensures newest entries sort first in Azure Table Storage's lexicographic ordering.

### Components

All components use Svelte 5 runes (`$state`, `$derived`, `$props`).

| Component               | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `BottomNav`             | Fixed bottom tab bar (Plan / History) with active-state tracking                |
| `SummaryBanner`         | Collapsible weekly summary card (headline + expandable detail lines)            |
| `DayPlan`               | Expandable session card listing exercises for a day; shows completion count     |
| `ExerciseCard`          | Individual exercise with target/actual display, inline edit mode, complete/undo |
| `PlanEditor`            | Modal for reviewing and saving generated plans                                  |
| `WeightChart`           | Chart.js line chart of bodyweight over time                                     |
| `ExerciseProgressChart` | Chart.js line chart tracking one exercise's weight or total reps across weeks   |

### Plan Generation Flow

```
User clicks "Generate next week"
  → POST /data/plans/next
  → Server fetches: current plan + this week's logs + last week's logs
  → Routes to provider:
      • LLMPlanProvider (if Azure OpenAI configured)
      • SmartCopyProvider (rule-based fallback)
  → SmartCopyProvider logic:
      • Hit all target reps → increase weight (+1kg light / +2.5kg heavy)
      • Missed reps → keep weight, add "Retry" note
      • No data → carry forward unchanged
  → Returns plan → shown in PlanEditor for review before saving
```

### Exercise Completion Flow

```
User taps "Mark Complete" on ExerciseCard
  → POST /data/exercises with exercise log
  → exerciseService.logExercise():
      • Computes rowKey = reverseTimestamp(date) + "_" + day
      • Fetches existing entity for that rowKey (if any)
      • Merges exercises by name (replace existing, append new)
      • Upserts merged entity
  → UI updates: shows actual values in green, counts toward progress
```

## Testing

Tests use Vitest (via `vite-plus/test`) with a jsdom environment.

```bash
vp test --run    # single run
vp test          # watch mode
```

**Mocking strategy**: each test mocks `tableStorage.getTableClient()` with a manual `TableClient` stub (`getEntity`, `upsertEntity`, `listEntities`, `deleteEntity`). Environment variables are stubbed via `tests/__mocks__/env.ts`.

**Coverage**: service CRUD operations, merge logic, date range filtering, date utilities, summary heuristics.

## Deployment

The app is configured for Azure Static Web Apps via `svelte-adapter-azure-swa`.

1. Create an Azure Static Web App resource
2. Set `AZURE_STORAGE_CONNECTION_STRING` in the SWA environment variables
3. Optionally set the `AZURE_OPENAI_*` variables for AI-powered plan generation
4. Connect your GitHub repo — the included GitHub Actions workflow handles CI/CD (lint → test → build → deploy)
