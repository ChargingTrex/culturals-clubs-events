import { expect, test } from '@playwright/test';

/**
 * Smoke: the seeded student signs in against a real backend (VITE_API_BASE)
 * and sees the events list. Needs `manage.py seed_demo` to have run.
 */
const EMAIL = process.env.E2E_EMAIL ?? '23la1041@college.edu';
const PASSWORD = process.env.E2E_PASSWORD ?? 'culturals-demo';

test('student signs in and sees what is on', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Institutional email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: "What's on" })).toBeVisible();
  await expect(page.getByTestId('event-row').first()).toBeVisible();
  await expect(
    page.getByTestId('nav-sidebar').getByRole('link', { name: 'My passes' }),
  ).toBeVisible();
});
