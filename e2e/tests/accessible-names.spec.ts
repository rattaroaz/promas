import { expect, test } from "@playwright/test";
import { SCREENS } from "../support/screens";

/**
 * Every control must say what it is: a screen reader reads the name aloud,
 * and the tests find fields by label and role.
 */
const CONTROLS = "input:visible, select:visible, textarea:visible, button:visible";

for (const screen of SCREENS) {
  test(`${screen.name}: every input, dropdown, and button has a name`, async ({ page }) => {
    await screen.open(page);
    const controls = page.locator(CONTROLS);
    const count = await controls.count();
    expect(count, `${screen.name} shows controls`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      const html = await control.evaluate((el) => el.outerHTML.slice(0, 160));
      await expect
        .soft(control, `${screen.name}: ${html}`)
        .toHaveAccessibleName(/\S/, { timeout: 1000 });
    }
  });
}
