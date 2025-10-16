import { test as setup } from "@playwright/test"

const AUTH_FILE = ".auth/user.json"

setup("Log into Checkly", async ({ page }) => {
  await page.goto("/")

  // Perform your login actions which will set cookies and localstorage entries
  // ...

  // Use storage state to write the browser state to disk
  // More info: https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state
  await page.context().storageState({ path: AUTH_FILE })
  console.log(`Wrote storage state to ${AUTH_FILE}`)
})
