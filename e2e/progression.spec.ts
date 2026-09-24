import { expect, test } from '@playwright/test';
import { AREAS, REGION_BOSS_ATTEMPT_COST } from '../src/simulation/content';
import { createGame } from '../src/simulation/simulation';
import { serializeSave } from '../src/simulation/save';

test('a new Hero completes Expeditions and reviews Build decisions', async ({ page }) => {
  await page.goto('/');
  const areaMap = page.getByRole('region', { name: 'Area Map' });
  await expect(areaMap.getByRole('button')).toHaveCount(25);
  await expect(areaMap.getByRole('button', { name: /Moonlit Grove/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Automatically repeat Expeditions' }).uncheck();
  await page.getByRole('combobox', { name: 'Target policy' }).selectOption('lowest-health');

  await page.getByRole('button', { name: 'Start Expedition' }).click();
  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('active');
  await expect(page.getByRole('combobox', { name: 'Target policy' })).toBeDisabled();
  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
  await expect(page.getByRole('region', { name: 'Expedition outcome' })).toContainText('completed');
  await expect(areaMap.getByRole('button', { name: /Moonlit Grove/ })).toBeEnabled();

  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
  await expect(page.getByRole('region', { name: 'Review queue' })).toContainText('Attribute points: 2');
  await page.getByRole('button', { name: /Spend 1 Might/ }).click();
  await page.getByRole('link', { name: 'Skills', exact: true }).click();
  for (const tree of ['physical', 'tank', 'magic']) {
    await expect(page.getByRole('region', { name: `${tree} Skill tree` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Level up Measured Strike' }).click();
  await page.getByRole('link', { name: 'Expedition', exact: true }).click();
  await page.getByRole('region', { name: 'Review queue' }).getByRole('link', { name: 'Review Loot' }).first().click();
  await expect(page.getByRole('heading', { name: 'Meadowguard Mail' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep in Inventory' }).click();
  await page.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Equipment and Loot' })).toContainText('chest: Meadowguard Mail');

  await page.reload();
  await expect(page.getByRole('button', { name: /Spend 1 Might/ })).toContainText('(1)');
  await expect(page.getByRole('combobox', { name: 'Target policy' })).toHaveValue('lowest-health');
  await expect(areaMap.getByRole('button', { name: /Moonlit Grove/ })).toBeEnabled();
  await areaMap.getByRole('button', { name: /Moonlit Grove/ }).click();
  await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
  await expect(areaMap.getByRole('button', { name: /Whispering Fen/ })).toBeEnabled();
});

test('the Region Boss charges currency only when an attempt starts', async ({ page }) => {
  const game = createGame();
  game.areaProgress['region-area-20'] = { completions: 1 };
  game.currency = REGION_BOSS_ATTEMPT_COST;
  await page.goto('/');
  await page.evaluate((save) => window.localStorage.setItem('idler.save', save), serializeSave(game));
  await page.goto('/');

  const areaMap = page.getByRole('region', { name: 'Area Map' });
  await areaMap.getByRole('button', { name: /Crown of Dawn Region Boss/ }).click();
  await expect(page.getByRole('heading', { name: 'Crown of Dawn Region Boss' })).toBeVisible();
  await expect(page.getByText(`${REGION_BOSS_ATTEMPT_COST} persistent currency`)).toBeVisible();
  await areaMap.getByRole('button', { name: /Sunlit Meadow/ }).click();
  await areaMap.getByRole('button', { name: /Crown of Dawn Region Boss/ }).click();
  await expect(page.getByText(`${REGION_BOSS_ATTEMPT_COST} persistent currency`)).toBeVisible();
  await page.getByRole('button', { name: 'Start Expedition' }).click();
  await expect(page.getByRole('status', { name: 'Expedition status' })).toHaveText('active');
  await expect(page.getByText('0 persistent currency')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Crown of Dawn Region Boss' })).toBeVisible();
  await expect(page.getByText('0 persistent currency')).toBeVisible();
});

test('the complete Region route, chapter Boss replays, and Region Boss can be completed', async ({ page }) => {
  test.setTimeout(120_000);
  const game = createGame();
  game.progression.attributes = { might: 100, vitality: 100, agility: 0, focus: 100 };
  await page.goto('/');
  await page.evaluate((save) => window.localStorage.setItem('idler.save', save), serializeSave(game));
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Automatically repeat Expeditions' }).uncheck();
  const areaMap = page.getByRole('region', { name: 'Area Map' });
  const attempt = async (name: string) => {
    await areaMap.getByRole('button', { name: new RegExp(`^${name} ·`) }).click();
    await page.getByRole('button', { name: 'Simulate 5 minutes' }).click();
    await expect(page.getByRole('region', { name: 'Expedition outcome' })).toContainText('completed');
  };

  for (const [index, area] of AREAS.filter(({ kind }) => kind === 'ordinary').entries()) {
    await attempt(area.name);
    if ((index + 1) % 5 === 0) {
      await attempt(area.name);
      await attempt(AREAS.find(({ id }) => id === `region-chapter-boss-${index + 1}`)!.name);
    }
  }
  await attempt(AREAS.find(({ kind }) => kind === 'region-boss')!.name);
  await expect(page.getByRole('region', { name: 'Recent outcomes' })).toContainText('Crown of Dawn Region Boss');
});

test('Physical, Tank, and Magic Build choices change the Hero', async ({ page }) => {
  const game = createGame();
  game.progression.level = 10;
  game.progression.attributePoints = 3;
  game.progression.skillPoints = 3;
  await page.goto('/');
  const save = serializeSave(game);
  const choices = [
    { attribute: 'Might', skill: 'Measured Strike', heroText: 'Build: 10 Attack' },
    { attribute: 'Vitality', skill: 'Fortitude', heroText: 'Health 113/113' },
    { attribute: 'Focus', skill: 'Focused Mind', heroText: 'Mana 20/37' },
  ];

  for (const choice of choices) {
    await page.evaluate((value) => window.localStorage.setItem('idler.save', value), save);
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`Spend 1 ${choice.attribute}`) }).click();
    await page.getByRole('link', { name: 'Skills', exact: true }).click();
    await page.getByRole('button', { name: `Level up ${choice.skill}` }).click();
    await page.getByRole('link', { name: 'Expedition', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Hero status' })).toContainText(choice.heroText);
  }
});
