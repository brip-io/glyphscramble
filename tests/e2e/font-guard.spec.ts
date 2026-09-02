import { expect, test } from "@playwright/test";

test("a protected block begins hidden and exposes no accessibility text", async ({
  page,
}) => {
  await page.setContent(
    '<p id="protected" hidden aria-hidden="true">Tdqfdu</p>',
  );
  const block = page.locator("#protected");
  await expect(block).toBeHidden();
  await expect(page.getByText("Secret")).toHaveCount(0);
  await expect(page.locator('[aria-hidden="true"]')).toHaveText("Tdqfdu");
});
