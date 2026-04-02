# Plan: Trainer SvelteKit Web App

A mobile-first **SvelteKit + TypeScript + Tailwind** web app for planning weekly gym sessions and tracking exercise/weight history. Data stored in **Azure Table Storage**, deployed to **Azure Container Apps**. AI summary is **mocked for now** (easy to swap in Azure OpenAI later). Well-architected with service/utility layers and unit test coverage via **Vitest**.

## Decisions

- **AI summary**: Mock/placeholder — returns a template string based on recent data; interface ready for Azure OpenAI later
- **Deployment**: Azure Container Apps with a Node container image
- **Exercise schema**: Weight-training focused — sets × reps @ weight (kg), with bodyweight exercise support (chin-ups). Training split: Mon Push / Tue Lower / Wed Pull / Fri Full Body
- **Auth**: None; single-user with a hardcoded partition key (`"default"`)
- **Data access**: SvelteKit `+server.ts` API routes call Azure Table Storage directly — no separate Functions project needed

---

## Phase 1 — Project Scaffold

1. Init SvelteKit project with Vite, TypeScript, Tailwind CSS 4, and a production Node adapter
2. Configure Vitest for unit testing
3. Add dependencies: `@azure/data-tables`, `date-fns`
4. Set up folder structure

## Phase 2 — Data Model & Services

5. Define TypeScript types in `src/lib/types/index.ts`:
   - `ExerciseEntry` — `name: string`, `targetWeight?: number` (kg, omit for bodyweight), `targetReps: number[]` (e.g. `[6,6,6,6]`), `actualWeight?: number`, `actualReps?: number[]`, `notes?: string`
   - `PlannedSession` — `day: 'monday'|'tuesday'|'wednesday'|'friday'`, `label: string` (e.g. "Push"), `exercises: ExerciseEntry[]`, `sessionNotes?: string` (e.g. "Listen to your body regarding the injury")
   - `WeeklyPlan` — `weekStart: string` (ISO date of Monday), `sessions: PlannedSession[]`
   - `ExerciseLog` — extends `PlannedSession` with `completedDate: string` and actual values filled in on each `ExerciseEntry`
   - `BodyweightEntry` — `date: string`, `weight: number` (kg)
6. `src/lib/services/tableStorage.ts` — thin wrapper around `@azure/data-tables` TableClient (connection string from env `AZURE_STORAGE_CONNECTION_STRING`)
7. `src/lib/services/planService.ts` — CRUD for weekly plans (`getCurrentWeekPlan`, `savePlan`, `getPlansForRange`)
8. `src/lib/services/exerciseService.ts` — CRUD for exercise logs + bodyweight entries
9. `src/lib/services/summaryService.ts` — mock AI summary with template string; designed with an interface for future provider swap
10. `src/lib/utils/dates.ts` — week boundary helpers, formatters _(parallel with 6–9)_
11. Unit tests for all services (mocking table storage client) and date utilities

## Phase 3 — API Routes (Server-Side)

12. `src/routes/api/plans/+server.ts` — GET current week plan, POST/PUT plan
13. `src/routes/api/plans/[weekId]/+server.ts` — GET specific week plan
14. `src/routes/api/exercises/+server.ts` — GET history (paginated/date-range), POST log entry
15. `src/routes/api/weight/+server.ts` — GET weight history, POST new entry
16. `src/routes/api/summary/+server.ts` — GET weekly AI summary

## Phase 4 — UI (Mobile-First)

17. Shared layout with bottom tab nav (Plan | History), Tailwind mobile-first container (`max-w-md` centered)
18. **Plan Screen** (`src/routes/+page.svelte`):
    - AI summary card at top
    - 7-day card list with planned exercises per day
    - Tap day → expand/edit exercises inline or slide-up panel
    - "Mark complete" action per exercise → logs to history
19. **History Screen** (`src/routes/history/+page.svelte`):
    - Toggle: Exercise History | Weight Chart
    - Reverse-chrono exercise list grouped by date
    - Weight line chart (chart.js via `svelte-chartjs`)
    - Bodyweight entry form
20. Reusable components: `ExerciseCard`, `DayPlan`, `SummaryBanner`, `WeightChart`, `BottomNav`
21. Touch-friendly styling: tap targets ≥44px, responsive up to tablet

## Phase 5 — Azure Table Storage Setup

22. Table + key strategy:
    - **Plans** — PK: `"default"`, RK: ISO week start `YYYY-MM-DD`
    - **ExerciseLogs** — PK: `"default"`, RK: reverse timestamp (`9999999999999 - ts`) for recent-first
    - **BodyWeight** — PK: `"default"`, RK: `YYYY-MM-DD`
23. `.env` (gitignored) with `AZURE_STORAGE_CONNECTION_STRING`
24. Local dev via **Azurite** emulator (no Azure subscription needed)

## Phase 6 — Deployment

25. Configure SvelteKit with Azure SWA adapter
26. Container-based deployment flow for Azure Container Apps
27. GitHub Actions CI: lint → test → build → deploy to SWA
28. Document all setup/deploy steps in README

---

## Folder Structure

```
src/
├── lib/
│   ├── types/index.ts              # Data model interfaces
│   ├── services/
│   │   ├── tableStorage.ts         # Azure Table client wrapper
│   │   ├── planService.ts          # Plan CRUD
│   │   ├── exerciseService.ts      # Exercise + weight CRUD
│   │   └── summaryService.ts       # Mock AI summary
│   ├── utils/dates.ts              # Week helpers, formatters
│   └── components/
│       ├── BottomNav.svelte
│       ├── SummaryBanner.svelte
│       ├── DayPlan.svelte
│       ├── ExerciseCard.svelte
│       └── WeightChart.svelte
├── routes/
│   ├── +layout.svelte              # Shell with bottom nav
│   ├── +page.svelte                # Plan screen
│   ├── history/+page.svelte        # History screen
│   └── api/                        # Server API routes
│       ├── plans/+server.ts
│       ├── plans/[weekId]/+server.ts
│       ├── exercises/+server.ts
│       ├── weight/+server.ts
│       └── summary/+server.ts
tests/
├── services/*.test.ts
└── utils/*.test.ts
```

## Tech Stack

- SvelteKit 2 (Svelte 5 runes)
- Vite 6
- TypeScript 5
- Tailwind CSS 4
- `@azure/data-tables`
- `date-fns` 4
- Vitest 3
- chart.js + svelte-chartjs
- Azure SWA CLI
- Azurite (local emulator)

## Verification

1. `npm run test` — all unit tests pass
2. `npm run build` — zero errors
3. `npx swa start` — runs locally against Azurite; both screens load
4. Chrome DevTools mobile (375px) — usable, adequate tap targets
5. POST plan → appears on Plan screen
6. Mark exercise complete → appears in History
7. Log bodyweight → chart updates
8. Deploy to SWA → smoke test live

## Excluded (For Now)

- Authentication / multi-user
- Real AI summary (mocked with template)
- Push notifications / PWA / offline
- Exercise library / auto-complete
- Detailed analytics / PR tracking

---

## Seed Data

The current week plan and 6 weeks of progress history (below) will be loaded as seed data into Azure Table Storage on first run. This validates the data model end-to-end.

### Current Week Plan (w/c 30 Mar 2026):

Monday Push
Bench Press
Target: 6,6,6,6 @ 62.5 kg (Small jump since 60 kg felt good)
Actual:

Incline DB Press
Target: 10,10,10,10 @ 18 kg (Time to level up from the 16s)
Actual:

Seated Shoulder Press
Target: 10,10,10 @ 14 kg (Clean up the reps from last week)
Actual:

Lateral Raises
Target: 12,12,12 @ 9 kg
Actual:

Tricep Pushdown
Target: 10,10,10 @ 54.4 kg (Matching your Friday win)
Actual:

Row (slow form)
Target: 8,8,8 @ 109 kg
Actual:

Seated Chest Press
Target: 10,10,10 @ 109 kg (Adding 1 rep per set)
Actual:

⸻

Tuesday Lower
(Listen to your body regarding the injury)
Leg Press
Target: 10,10,10 @ 145 kg
Actual:

Leg Press Calves
Target: 14,14,14,20 @ 106.6 kg
Actual:

RDL
Target: 8,8,8 @ 62.5 kg
Actual:

Squat
Target: 6,6,6 @ 75 kg
Actual:

Leg Curl
Target: 12,12,12 @ 63 kg
Actual:

Leg Extension
Target: 10,10,10 @ 75 kg
Actual:

⸻

Wednesday Pull
Chin-ups
Target: 10,10,9 (Pushing for one more rep on the last set)
Actual:

Seated Row
Target: 10,10,10,10 @ 111 kg (Small 2 kg bump)
Actual:

Lat Pull
Target: 12,12,12 @ 65 kg (Micro-increase)
Actual:

DB Curl
Target: 10,10,10 @ 14 kg (Moving away from the 12s)
Actual:

Hammer Curl
Target: 8,8,8 @ 14 kg
Actual:

Cable Curl
Target: 12,12,12 @ 47.5 kg
Actual:

⸻

Friday Full Body
Bench Press
Target: 5x5 @ 67.5 kg (Goal: get 5 reps on that final set)
Actual:

Leg Press
Target: 8,8,8 @ 152.1 kg
Actual:

Seated Row
Target: 10,10,10 @ 109 kg
Actual:

Seated Shoulder Press
Target: 10,10,10 @ 16 kg
Actual:

Cable Curl
Target: 10,10,10 @ 52 kg
Actual:

Tricep Pushdown
Target: 10,10,10 @ 56.5 kg (Small bump since you're moving 54.4 kg well)
Actual:

Smith Shoulder Press
Target: 10,10,10 @ 42.5 kg (Small increase)
Actual:

⸻

Weight Log
21 Jan 26: 76.8 kg

23 Jan 26: 77.4 kg

30 Jan 26: 77.9 kg

06 Feb 26: 77.8 kg

14 Feb 26: 76.9 kg

06 Mar 26: 77.2 kg

13 Mar 26: 77.1 kg

20 Mar 26: 77.8 kg

27 Mar 26: 77.7 kg

### Progress History (Weeks 1–6)

### Training Progress Log: Weeks 1–6

| Exercise (Day)              | Week 1       | Week 2        | Week 3       | Week 4         | Week 5           | Week 6 (Latest)                |
| :-------------------------- | :----------- | :------------ | :----------- | :------------- | :--------------- | :----------------------------- |
| **Bench Press (Mon)**       | 50 (6,6,6,4) | 50 (6,6,6,6)  | 55 (6,6,6,6) | 57.5 (6,6,6,6) | 60 (6,6,6)       | **60 (6,6,6,6)**               |
| **Bench Press (Fri)**       | 52.5 (4x5)   | 55 (5x5)      | 57.5 (5x5)   | 60 (5x5)       | 65 (5x5) + 70x2  | **67.5 (5,5,5,5,2)**           |
| **Incline DB Press (Mon)**  | 14 (8,8,8)   | 14 (9,9,9)    | 16 (9,9,9)   | 16 (12,12,10)  | 16 (10,10,10+)   | **16 (10,10,10,10)**           |
| **Shoulder Press DB (M/F)** | 14 (6,4,4)   | 12–14 mixed   | 12 (8,8,8)   | 14 (10,9,7)    | 14–16 prog.      | **14 (10,8,8) / 16 (10,10,8)** |
| **Lateral Raises (M/F)**    | 6 (10,10,8)  | 6–9 prog.     | 9 (12,12,10) | 9 (12,12,12)   | 9–13.6 mixed     | **9 (12,12,12)**               |
| **Tricep Pushdown**         | 45 (8,8,8)   | 45 (9,9,9)    | 45–40 prog.  | 45–50 prog.    | 50 (10,10,10)    | **52 (10s) / 54.4 (10s)**      |
| **Seated Row (M/W/F)**      | 102 (6s)     | 102–109       | 109 (8s)     | 109 (10s)      | 109 (10s stable) | **109 (10s) / 109 (8s slow)**  |
| **Chin-ups (Wed)**          | 3,4,3        | 4,4,4         | 6,6,5        | 10,7,4         | 10,10,6          | **10,10,8**                    |
| **Leg Press (Tue/Fri)**     | ~88          | ~115          | ~133         | 140            | 152              | **Injury (Skipped Fri)**       |
| **Squat (Tue)**             | 50 (6,6,6)   | 52.5 (6,6,10) | 60–70 prog.  | 70 (6,6,8)     | 75 (6,6)         | **75 (Pending)**               |
| **RDL (Tue)**               | 40           | 45            | 50           | 55             | 60               | **62.5 (Pending)**             |
| **Leg Curl (Tue)**          | ~40          | ~47           | ~47–54       | ~54            | ~61              | **63 (Pending)**               |
| **Leg Extension (Tue)**     | ~54          | ~60           | ~61          | ~61–65         | ~68–75           | **75 (Pending)**               |
| **DB Curl (Wed)**           | 12 (6s)      | 10 (8s)       | 10 (9–10s)   | 12 (10s)       | 12 (10s)         | **12 (10,10,10)**              |
| **Hammer Curl (Wed)**       | —            | —             | —            | 14 (6,5,5)     | 14 (8,8,8)       | **14 (8,8,8)**                 |
| **Cable Curl (W/F)**        | 22           | 25            | 31           | 36–40          | 45+              | **45.4 (12s) / 49.9 (10s)**    |
| **Smith Press (Fri)**       | 30 (8,6,6)   | 32.5 (8s)     | 32.5 (8s)    | 35 (9,8,8)     | 40 (10,10,8)     | **40 (10,10,10)**              |

---

## Data Model Observations

From the seed data above, the following refinements apply:

1. **All exercises are weight training** — no cardio fields needed (duration, distance removed from model)
2. **Bodyweight exercises exist** — chin-ups have no weight; `targetWeight` is optional
3. **Same exercise appears on multiple days** — Bench Press (Mon 4×6 hypertrophy, Fri 5×5 strength), Seated Row (Mon slow-form, Wed/Fri normal). The name + day uniquely identifies context
4. **Per-set weight rarely varies** — 99% of entries use one weight across all sets. Edge case: "65 (5×5) + 70×2" can be stored as two entries or handled via notes. Model uses a single `targetWeight` per exercise entry for simplicity
5. **Notes are important** — form cues ("slow form"), injury warnings ("Listen to your body"), progression context ("Small jump since 60 kg felt good"). Stored at both session and exercise level
6. **Reps as arrays** — `[6,6,6,6]` naturally captures per-set rep counts and set count in one field
7. **Weight log is sparse** — ~weekly entries, not daily. Simple date→weight mapping
8. **Week numbering** — plans keyed by Monday's ISO date (`2026-03-30`). History table rows track which week they belong to

## Mock AI Summary Template

Based on the progress data, the mock summary generator will produce text like:

> **Week 7 Focus**: Upper body pressing continues to climb — bench hit 60 kg for clean 4×6 last week, targeting 62.5 kg this Monday. Chin-ups progressing well at 10,10,8 — push for that last rep. Lower body returning cautiously after the injury scare — keep leg press conservative. Bodyweight stable at ~77.7 kg. Key goal this week: nail the 67.5 kg 5×5 bench on Friday.

The mock implementation will scan recent logs for:

- Exercises with weight increases vs previous week
- Rep PRs (hitting full target reps for the first time)
- Any session notes mentioning injury
- Bodyweight trend direction

---

## Next Steps

The plan is complete. Review the following before we start building:

1. **Anything to change?** — Adjust the data model, add/remove exercises, change the split, modify any phase
2. **Missing exercises?** — The progress table has Lat Pull, Seated Chest Press, Leg Press Calves not tracked in history — should they be in the seed data?
3. **Week dates for history** — To seed the 6 weeks of progress, I need the start dates. Based on "Week 6 = latest" and current date 30 Mar 2026, I'll assume: Week 6 = w/c 23 Mar, Week 5 = w/c 16 Mar, ... Week 1 = w/c 16 Feb. Correct?
4. **Ready to build?** — Say the word and I'll scaffold the full project
