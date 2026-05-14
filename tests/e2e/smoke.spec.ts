import { expect, test } from "@playwright/test";

test("loads weekly plan screen", async ({ page }) => {
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

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "This Week's Plan" })).toBeVisible();
  await expect(page.getByText("Monday — Push")).toBeVisible();
});

test("removes an exercise from the weekly plan", async ({ page }) => {
  await page.route("**/data/plans", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        weekStart: "2026-05-11",
        sessions: [
          {
            day: "monday",
            label: "Push",
            exercises: [
              {
                name: "Bench Press",
                targetWeight: 80,
                targetReps: [6, 6, 6],
              },
            ],
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

  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  await page.getByRole("button", { name: /monday — push/i }).click();
  await expect(page.getByText("Bench Press")).toBeVisible();

  await page.getByRole("button", { name: /remove bench press from this week's plan/i }).click();

  await expect(page.getByText("Bench Press")).toHaveCount(0);
});
