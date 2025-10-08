import { test } from "@playwright/test"

test("Visit logged in area", async ({ page }) => {
  await page.goto("/")

  // More test code ..

})