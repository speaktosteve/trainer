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
