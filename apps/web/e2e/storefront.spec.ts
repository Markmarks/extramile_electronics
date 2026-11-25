import { expect, test, type Page } from '@playwright/test';
import { supabaseUp } from '../../../e2e/backend';

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * Catalogue flows. In `next dev` the storefront falls back to the demo catalogue when
 * Supabase is unreachable (src/lib/catalog/demo.ts), so these run with or without a backend.
 */
test.describe('storefront: browse', () => {
  test('home renders sections and product cards', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    await expect(page.getByText('Browse', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Top rated', { exact: true }).first()).toBeVisible();
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a product card opens its product page with a cedi price', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('a[href^="/p/"]').first();
    const href = (await card.getAttribute('href'))!;
    const name = (await card.getByRole('heading', { level: 3 }).innerText()).trim();
    // `next dev` compiles /p/[slug] on first visit, so allow the navigation itself time.
    await Promise.all([page.waitForURL(`**${href}`, { timeout: 60_000 }), card.click()]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.getByText(/GH₵\s?[\d,]+\.\d{2}/).first()).toBeVisible();
  });

  test('search finds a product by a word from its name', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('a[href^="/p/"]').first();
    const href = (await card.getAttribute('href'))!;
    const name = (await card.getByRole('heading', { level: 3 }).innerText()).trim();
    const word = name.split(/\s+/).find((w) => w.length >= 4) ?? name.split(/\s+/)[0]!;
    await page.goto(`/search?q=${encodeURIComponent(word)}`);
    await expect(page.getByText(/^0 results/)).toHaveCount(0);
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  });

  test('a product page has a customer reviews section', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/');
    const href = (await page.locator('a[href^="/p/"]').first().getAttribute('href'))!;
    await page.goto(href);
    await expect(page.getByRole('heading', { name: 'Customer reviews' })).toBeVisible();
    // Either published reviews or the empty state — never a broken section.
    await expect(page.getByTestId('review-list').or(page.getByTestId('no-reviews'))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('sign-in page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('an empty bag says so', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByText('Your bag is empty')).toBeVisible();
  });
});

/** Cart and checkout need real variants (demo items can't be bought) — live backend only. */
test.describe('storefront: buy', { tag: '@backend' }, () => {
  test.beforeAll(async () => {
    const { ok, why } = await supabaseUp('web');
    test.skip(!ok, why);
  });

  test('add to bag → bag shows the item and subtotal → checkout form', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/p/"]').first().click();
    const add = page.getByRole('button', { name: /add to bag/i });
    await add.click();
    // Wait for the server action to finish (button leaves "Adding…") so the cart cookie
    // is set before /cart renders server-side — the header count loads client-side later
    // and would otherwise hide this race.
    await expect(page.getByRole('button', { name: /adding/i })).toHaveCount(0, { timeout: 30_000 });
    await expect(add).toBeEnabled();
    await page.goto('/cart');
    await expect(page.getByText('Subtotal')).toBeVisible();
    await expect(page.getByText(/GH₵\s?[\d,]+\.\d{2}/).first()).toBeVisible();
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    // Never submits a payment — Paystack is exercised manually with pk_test_ keys only.
  });

  test('a signed-out visitor is asked to sign in to review, and comes back to the form', async ({
    page,
  }) => {
    await page.goto('/');
    const href = (await page.locator('a[href^="/p/"]').first().getAttribute('href'))!;
    await page.goto(href);
    const signIn = page.getByRole('link', { name: 'Sign in to write a review' });
    await expect(signIn).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('review-form')).toHaveCount(0);
    await signIn.click();
    await page.waitForURL('**/login?**');
    expect(new URL(page.url()).searchParams.get('next')).toBe(`${href}#write-review`);
    // Writing one needs a customer with a delivered order — there is no seeded account;
    // the DB rules are covered in apps/web/tests/db/reviews.test.ts.
  });
});
