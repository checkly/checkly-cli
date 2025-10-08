import { expect, test } from "@playwright/test"

test("Visit Checkly home page", async ({ page }) => {
  await page.goto("/docs")

  await expect(page).toHaveTitle(/Checkly/)

  // More test code ...
})
