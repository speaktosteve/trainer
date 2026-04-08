<script lang="ts">
  import { onMount } from "svelte";
  import GoalProgressChart from "$lib/components/GoalProgressChart.svelte";
  import type { GoalType, GoalWithProgress } from "$lib/types";

  type Recommendation = {
    title: string;
    type: GoalType;
    targetValue: number;
    targetDate: string;
    exerciseName?: string;
    sessionsPerWeek?: number;
    notes?: string;
  };

  let goals = $state<GoalWithProgress[]>([]);
  let recommendations = $state<Recommendation[]>([]);
  let loading = $state(true);
  let generating = $state(false);
  let addingRecommendation = $state<string | null>(null);
  let replacingRecommendation = $state<string | null>(null);
  let excludedRecommendationKeys = $state<string[]>([]);

  let formTitle = $state("");
  let formType = $state<GoalType>("lifting");
  let formExerciseName = $state("Bench Press");
  let formTargetValue = $state<number | undefined>(undefined);
  let formTargetDate = $state(new Date(new Date().setDate(new Date().getDate() + 56)).toISOString().slice(0, 10));
  let formSessionsPerWeek = $state<number | undefined>(3);
  let formNotes = $state("");
  let saving = $state(false);

  const inProgressGoals = $derived(goals.filter((goal) => goal.status === "in_progress"));
  const completedGoals = $derived(goals.filter((goal) => goal.status === "completed"));

  function getRecommendationKey(recommendation: Recommendation): string {
    return [
      recommendation.type,
      recommendation.title.trim().toLowerCase(),
      recommendation.exerciseName?.trim().toLowerCase() ?? "",
      recommendation.targetValue,
      recommendation.targetDate,
      recommendation.sessionsPerWeek ?? "",
    ].join("|");
  }

  function formatTarget(goal: GoalWithProgress): string {
    if (goal.type === "lifting") {
      return `${goal.exerciseName ?? "Exercise"}: ${goal.targetValue} kg by ${goal.targetDate}`;
    }
    if (goal.type === "bodyweight") {
      return `Bodyweight: ${goal.targetValue} kg by ${goal.targetDate}`;
    }
    return `${goal.sessionsPerWeek ?? goal.targetValue} sessions/week until ${goal.targetDate}`;
  }

  function formatCurrent(goal: GoalWithProgress): string {
    if (goal.type === "consistency") {
      return `${goal.currentValue.toFixed(0)} sessions/week`;
    }
    return `${goal.currentValue.toFixed(1)} kg`;
  }

  function metricLabel(goal: GoalWithProgress): string {
    return goal.type === "consistency" ? "Sessions" : "Weight (kg)";
  }

  async function loadGoals() {
    const res = await fetch("/data/goals");
    if (res.ok) goals = await res.json();
  }

  async function loadRecommendations() {
    generating = true;
    const res = await fetch("/data/goals/recommendations");
    if (res.ok) {
      recommendations = await res.json();
      excludedRecommendationKeys = [];
    }
    generating = false;
  }

  async function addRecommendation(rec: Recommendation) {
    addingRecommendation = rec.title;
    const res = await fetch("/data/goals/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });

    if (res.ok) {
      await loadGoals();
      recommendations = recommendations.filter((item) => item.title !== rec.title);
      excludedRecommendationKeys = [...excludedRecommendationKeys, getRecommendationKey(rec)];
    }

    addingRecommendation = null;
  }

  async function dismissRecommendation(rec: Recommendation) {
    replacingRecommendation = rec.title;

    const updatedExcludeKeys = [
      ...excludedRecommendationKeys,
      ...recommendations.map((item) => getRecommendationKey(item)),
    ];

    const res = await fetch("/data/goals/recommendations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dismissedRecommendation: rec,
        excludeKeys: Array.from(new Set(updatedExcludeKeys)),
      }),
    });

    if (res.ok) {
      const replacement = (await res.json()) as Recommendation | null;
      const index = recommendations.findIndex((item) => item.title === rec.title);
      const remaining = recommendations.filter((item) => item.title !== rec.title);
      if (replacement && index >= 0) {
        recommendations = [
          ...remaining.slice(0, index),
          replacement,
          ...remaining.slice(index),
        ];
      } else {
        recommendations = remaining;
      }
      excludedRecommendationKeys = Array.from(new Set(updatedExcludeKeys));
    }

    replacingRecommendation = null;
  }

  async function saveGoal() {
    if (!formTitle || !formTargetValue || !formTargetDate) return;

    saving = true;

    const payload = {
      title: formTitle,
      type: formType,
      targetValue: formTargetValue,
      targetDate: formTargetDate,
      startDate: new Date().toISOString().slice(0, 10),
      exerciseName: formType === "lifting" ? formExerciseName : undefined,
      sessionsPerWeek: formType === "consistency" ? formSessionsPerWeek : undefined,
      notes: formNotes || undefined,
      status: "in_progress",
    };

    const res = await fetch("/data/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      formTitle = "";
      formTargetValue = undefined;
      formNotes = "";
      await loadGoals();
    }

    saving = false;
  }

  async function setGoalStatus(goal: GoalWithProgress, status: "in_progress" | "completed" | "paused") {
    const res = await fetch(`/data/goals/${goal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...goal, status }),
    });

    if (res.ok) await loadGoals();
  }

  async function removeGoal(goalId: string) {
    const res = await fetch(`/data/goals/${goalId}`, { method: "DELETE" });
    if (res.ok) await loadGoals();
  }

  onMount(async () => {
    await Promise.all([loadGoals(), loadRecommendations()]);
    loading = false;
  });
</script>

<svelte:head>
  <title>Goals — Trainer</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between">
  <h1 class="text-xl font-bold text-base-content md:text-2xl">Goals</h1>
  <button class="btn btn-outline btn-sm" onclick={loadRecommendations} disabled={generating}>
    {generating ? "Refreshing…" : "Refresh AI goals"}
  </button>
</div>

{#if loading}
  <div class="space-y-3">
    {#each Array(3) as _, i (i)}
      <div class="h-24 animate-pulse rounded-xl bg-base-300"></div>
    {/each}
  </div>
{:else}
  <section class="mb-4 space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/60">In Progress</h2>
    {#if inProgressGoals.length === 0}
      <div class="card bg-base-100 p-6 text-sm text-base-content/60 shadow-sm">No active goals yet.</div>
    {:else}
      {#each inProgressGoals as goal (goal.id)}
        <div class="card card-border bg-base-100 p-4 shadow-sm">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="text-base font-semibold text-base-content">{goal.title}</h3>
              <p class="text-xs text-base-content/60">{formatTarget(goal)}</p>
              {#if goal.notes}
                <p class="mt-1 text-xs italic text-info">{goal.notes}</p>
              {/if}
            </div>
            <span class={`badge ${goal.isOnTrack ? "badge-success" : "badge-warning"}`}>{goal.isOnTrack ? "On track" : "At risk"}</span>
          </div>

          <div class="mt-3">
            <div class="mb-1 flex justify-between text-xs text-base-content/60">
              <span>Current: {formatCurrent(goal)}</span>
              <span>{Math.round(goal.progressPercent)}%</span>
            </div>
            <progress class="progress progress-primary w-full" value={goal.progressPercent} max="100"></progress>
          </div>

          <div class="mt-3 rounded-lg border border-base-300 bg-base-200 p-2">
            <GoalProgressChart points={goal.progressPoints} valueLabel={metricLabel(goal)} startDate={goal.startDate} targetDate={goal.targetDate} />
          </div>

          <div class="mt-3 flex gap-2">
            <button class="btn btn-success btn-sm" onclick={() => setGoalStatus(goal, "completed")}>Mark done</button>
            <button class="btn btn-ghost btn-sm" onclick={() => setGoalStatus(goal, "paused")}>Pause</button>
            <button class="btn btn-ghost btn-sm text-error" onclick={() => removeGoal(goal.id)}>Delete</button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <section class="mb-4 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-base-content/60">Create Goal</h2>

    <div class="grid gap-3 md:grid-cols-2">
      <label class="block">
        <span class="text-xs text-base-content/60">Title</span>
        <input class="input input-bordered input-sm mt-1 w-full" bind:value={formTitle} placeholder="Bench Press 70kg" />
      </label>

      <label class="block">
        <span class="text-xs text-base-content/60">Type</span>
        <select class="select select-bordered select-sm mt-1 w-full" bind:value={formType}>
          <option value="lifting">Lifting</option>
          <option value="bodyweight">Bodyweight</option>
          <option value="consistency">Consistency</option>
        </select>
      </label>

      {#if formType === "lifting"}
        <label class="block">
          <span class="text-xs text-base-content/60">Exercise</span>
          <input class="input input-bordered input-sm mt-1 w-full" bind:value={formExerciseName} />
        </label>
      {/if}

      <label class="block">
        <span class="text-xs text-base-content/60">Target value {formType === "consistency" ? "(sessions/week)" : "(kg)"}</span>
        <input
          class="input input-bordered input-sm mt-1 w-full"
          type="number"
          step={formType === "consistency" ? "1" : "0.1"}
          bind:value={formTargetValue}
        />
      </label>

      <label class="block">
        <span class="text-xs text-base-content/60">Target date</span>
        <input class="input input-bordered input-sm mt-1 w-full" type="date" bind:value={formTargetDate} />
      </label>

      {#if formType === "consistency"}
        <label class="block">
          <span class="text-xs text-base-content/60">Sessions per week</span>
          <input class="input input-bordered input-sm mt-1 w-full" type="number" min="1" bind:value={formSessionsPerWeek} />
        </label>
      {/if}

      <label class="block md:col-span-2">
        <span class="text-xs text-base-content/60">Notes (optional)</span>
        <input class="input input-bordered input-sm mt-1 w-full" bind:value={formNotes} />
      </label>
    </div>

    <button class="btn btn-primary mt-3" onclick={saveGoal} disabled={saving}>
      {saving ? "Saving…" : "Save Goal"}
    </button>
  </section>

  <section class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/60">AI Recommended Goals</h2>
    {#if recommendations.length === 0}
      <div class="card bg-base-100 p-5 text-sm text-base-content/60 shadow-sm">No recommendations available.</div>
    {:else}
      {#each recommendations as recommendation (recommendation.title)}
        <div class="card card-border bg-base-100 p-4 shadow-sm">
          <h3 class="text-sm font-semibold text-base-content">{recommendation.title}</h3>
          <p class="mt-1 text-xs text-base-content/60">
            {recommendation.type} · target {recommendation.targetValue}
            {recommendation.type === "consistency" ? " sessions/week" : " kg"}
            · by {recommendation.targetDate}
          </p>
          {#if recommendation.notes}
            <p class="mt-1 text-xs italic text-info">{recommendation.notes}</p>
          {/if}
          <div class="mt-3">
            <div class="flex gap-2">
              <button
                class="btn btn-secondary btn-sm"
                disabled={addingRecommendation === recommendation.title || replacingRecommendation === recommendation.title}
                onclick={() => addRecommendation(recommendation)}
              >
                {addingRecommendation === recommendation.title ? "Adding…" : "Add Goal"}
              </button>
              <button
                class="btn btn-ghost btn-sm"
                disabled={replacingRecommendation === recommendation.title || addingRecommendation === recommendation.title}
                onclick={() => dismissRecommendation(recommendation)}
              >
                {replacingRecommendation === recommendation.title ? "Replacing…" : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  {#if completedGoals.length > 0}
    <section class="mt-4 rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60">Completed</h2>
      <div class="space-y-2">
        {#each completedGoals as goal (goal.id)}
          <div class="flex items-center justify-between text-sm">
            <span>{goal.title}</span>
            <span class="badge badge-success badge-sm">Completed</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
{/if}
