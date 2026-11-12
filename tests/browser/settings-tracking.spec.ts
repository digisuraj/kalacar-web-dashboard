import { expect, test } from "@playwright/test";
import { expectFits, mockApi, watchErrors } from "./mock-api";

test("Settings > Ads and analytics: paste the install codes and only the IDs are kept", async ({ page }) => {
  const errors = watchErrors(page);
  const state = await mockApi(page);
  await page.goto("/settings?tab=marketing");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Tracking codes" }) });
  await expect(card.getByText("None")).toBeVisible();
  await card.getByLabel("Meta (Facebook) Pixel ID").fill("fbq('init', '4436512496660507');");
  await card.getByLabel(/Google tags/).fill('<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-KZJ27PVT"></script>\nGTM-PMJWSM6Z');
  await expect(card.getByText("Unsaved changes")).toBeVisible();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved. 3 tags now load on every shop page.")).toBeVisible();
  await expect(card.getByLabel("Meta (Facebook) Pixel ID")).toHaveValue("4436512496660507");
  await expect(card.getByLabel(/Google tags/)).toHaveValue("GTM-KZJ27PVT\nGTM-PMJWSM6Z");
  await expect(card.getByText("3 active")).toBeVisible();
  expect(state.saved).toHaveLength(1);
  await expectFits(page);
  expect(errors).toEqual([]);
});
