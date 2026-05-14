import { expect, test } from "@playwright/test";

test("weekly plan add form prefills from latest submitted exercise record", async ({ page }) => {
  await page.route("**/data/plans", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        weekStart: "2026-05-11",
        sessions: [
          {
            day: "monday",
            label: "Push",
            exercises: [],
          },
        ],
      }),
    });
  });

  await page.route("**/data/exercises?weekStart=2026-05-11", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/data/plans/next?sourceWeek=2026-05-11", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.route("**/data/exercises/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ name: "Bench Press" }]),
    });
  });

  await page.route("**/data/exercises?latestFor=Bench+Press", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ targetReps: [5, 5, 4], targetWeight: 82.5 }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /monday — push/i }).click();
  await page.getByRole("button", { name: "Add New" }).click();

  await expect(page.getByLabel("Target reps")).toHaveValue("5,5,4");
  await expect(page.getByLabel("Target weight (kg)")).toHaveValue("82.5");
});

test("plan review add form prefills from latest submitted exercise record", async ({ page }) => {
  await page.route("**/data/plans", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        weekStart: "2026-05-11",
        sessions: [
          {
            day: "monday",
            label: "Push",
            exercises: [],
          },
        ],
      }),
    });
  });

  await page.route("**/data/exercises?weekStart=2026-05-11", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/data/plans/next?sourceWeek=2026-05-11", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        weekStart: "2026-05-18",
        sessions: [
          {
            day: "monday",
            label: "Push",
            exercises: [],
          },
        ],
      }),
    });
  });

  await page.route("**/data/exercises/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ name: "Back Squat" }]),
    });
  });

  await page.route("**/data/exercises?latestFor=Back+Squat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ targetReps: [6, 6, 6, 6], targetWeight: 120 }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /\+ add exercise/i }).click();

  await expect(page.getByLabel("Sets")).toHaveValue("4");
  await expect(page.getByLabel("Reps per set")).toHaveValue("6");
  await expect(page.getByLabel("Target weight (kg)")).toHaveValue("120");
});
