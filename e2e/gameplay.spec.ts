import { test, expect } from "@playwright/test";

test.describe("Full game win flow", () => {
  test("player types target word and wins", async ({ page }) => {
    await page.goto("/");

    const targetWord = "CRANE";

    for (const letter of targetWord) {
      await page.keyboard.press(letter);
    }
    await page.keyboard.press("Enter");

    const winModal = page.getByRole("dialog");
    await expect(winModal).toBeVisible({ timeout: 5000 });
  });
});