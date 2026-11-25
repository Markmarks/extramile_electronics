import { expect, test, type Page } from '@playwright/test';
import { supabaseUp } from '../../../e2e/backend';

/** Fail the test on any uncaught page error, not just on failed assertions. */
function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test.describe('back-office: device enrollment', () => {
  test('shows the set-up form with all fields and a disabled submit', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    await expect(page.getByText('Set up this device')).toBeVisible({ timeout: 20_000 });
    for (const label of ['Email', 'Password', 'New PIN', 'Confirm PIN']) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Bind device & set PIN/ })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('flags mismatched PINs and keeps submit disabled', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill('e2e-staff@example.test');
    await page.getByLabel('Password').fill('not-a-real-password');
    await page.getByLabel('New PIN').fill('123456');
    await page.getByLabel('Confirm PIN').fill('654321');
    await expect(page.getByText('PINs do not match.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Bind device & set PIN/ })).toBeDisabled();
  });

  test('PIN fields accept digits only, max 6', async ({ page }) => {
    await page.goto('/');
    const pin = page.getByLabel('New PIN');
    await pin.fill('12ab34-56');
    await expect(pin).toHaveValue('123456');
  });

  test('a network failure during sign-in shows an error instead of hanging', async ({ page }) => {
    // Simulates today's outage deterministically: every Supabase auth call fails.
    await page.route('**/auth/v1/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await page.getByLabel('Email').fill('e2e-staff@example.test');
    await page.getByLabel('Password').fill('not-a-real-password');
    await page.getByLabel('New PIN').fill('123456');
    await page.getByLabel('Confirm PIN').fill('123456');
    await page.getByRole('button', { name: /Bind device & set PIN/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: /Bind device & set PIN/ })).toBeEnabled();
  });
});

test.describe('back-office: signed-in shell (UI preview mode)', () => {
  const views = ['Dashboard', 'Orders', 'Catalogue', 'Inventory', 'Users'];

  test('every sidebar view opens without a page error', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/?preview');
    const nav = page.getByRole('navigation');
    for (const view of views) {
      const item = nav.getByRole('button', { name: view });
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.click();
      // The clicked item becomes the current page and its view renders some content.
      await expect(item).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('back-office: live backend', { tag: '@backend' }, () => {
  test.beforeAll(async () => {
    const { ok, why } = await supabaseUp('desktop');
    test.skip(!ok, why);
  });

  test('auth endpoint rejects bad credentials with a readable message', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill('e2e-nobody@example.test');
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByLabel('New PIN').fill('123456');
    await page.getByLabel('Confirm PIN').fill('123456');
    await page.getByRole('button', { name: /Bind device & set PIN/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toHaveText(/Failed to fetch/i);
  });
});
