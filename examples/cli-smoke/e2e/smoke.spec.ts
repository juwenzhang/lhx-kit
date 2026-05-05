import {expect, test} from '@playwright/test';

test('home page renders title', async ({page}) => {
  await page.goto('/home/');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
});
