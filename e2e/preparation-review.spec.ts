import { expect, test } from '@playwright/test';
import { createGame, dispatch } from '../src/simulation/simulation';
import { serializeSave } from '../src/simulation/save';

test('reviews new Item Loot between Expeditions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Automatically repeat Expeditions' }).uncheck();
  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();

  const reviewQueue = page.getByRole('region', { name: 'Review queue' });
  await expect(reviewQueue).toContainText('Item and Loot decision');
  await reviewQueue.getByRole('link', { name: 'Review Loot' }).first().click();
  await expect(page.getByRole('heading', { name: 'Meadowguard Mail' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep in Inventory' }).click();
  await expect(reviewQueue).not.toContainText('Meadowguard Mail');
});

test('changes repeat preferences without interrupting Combat and records outcomes in History', async ({ page }) => {
  await page.goto('/');
  const automaticRepeat = page.getByRole('checkbox', { name: 'Automatically repeat Expeditions' });
  await automaticRepeat.uncheck();
  await page.getByRole('button', { name: 'Start Expedition' }).click();
  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('active');
  await expect(page.getByRole('combobox', { name: 'Target policy' })).toBeDisabled();
  await automaticRepeat.check();
  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('active');
  await page.getByRole('button', { name: 'Withdraw' }).click();

  const outcome = page.getByRole('region', { name: 'Expedition outcome' });
  await expect(outcome).toContainText('Cause: The Expedition was withdrawn');
  await expect(outcome).toContainText('committed');
  await expect(outcome).toContainText('Lost from the incomplete Room');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('region', { name: 'Recent outcomes' })).toContainText('Expedition withdrawn · Sunlit Meadow');
});

test('explains an offline Defeat, lost rewards, Recovery, and automatic restart', async ({ page }) => {
  const active = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
  const savedState = serializeSave(active, Date.now() - 10_000);
  await page.addInitScript((save) => window.localStorage.setItem('idler.save', save), savedState);
  await page.goto('/');

  const summary = page.getByRole('region', { name: 'Offline Summary' });
  await expect(summary).toContainText('Expedition defeated: Ari was defeated during Combat');
  await expect(summary).toContainText('currency lost from incomplete Rooms');
  await expect(summary).toContainText('Recovery: 3s');
  await expect(summary).toContainText('the Area will restart automatically');
});

test('Recovery finishes and restarts the selected Area while the browser stays open', async ({ page }) => {
  let game = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
  game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
  if (game.status !== 'recovery') throw new Error('Expected the fixture Expedition to end in Recovery');
  await page.addInitScript((save) => window.localStorage.setItem('idler.save', save), serializeSave(game));
  await page.goto('/');

  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('recovery');
  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('active', { timeout: 6_000 });
  await expect(page.getByRole('region', { name: 'Room progress' })).toContainText('Room 1 of 3');
});
