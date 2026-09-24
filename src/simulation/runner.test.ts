import { describe, expect, it } from 'vitest';
import { AREAS, SKILLS } from './content';
import { AFFIXES, EXCEPTIONAL_ITEMS, ITEM_BASES } from './content';
import { GOLDEN_SCENARIOS, assertSimulationInvariants, assertGoldenScenarios, assertScenarioDeterminism, runScenario, runScenarioBatch, validateContent } from './runner';

describe('headless Simulation runner', () => {
  it('runs a named scenario with reproducible summaries', () => {
    const scenario = { name: 'first-expedition', version: 'v1-expedition-loop', seed: 11, durationMilliseconds: 20_000 };
    const first = runScenario(scenario);
    const second = runScenario(scenario);

    expect(first).toEqual(second);
    expect(first.scenario).toBe('first-expedition');
    expect(first.version).toBe('v1-expedition-loop');
    expect(first.seed).toBe(11);
    expect(first.loot).toEqual(expect.objectContaining({ itemIds: expect.any(Array) }));
    expect(first.loot.items).toEqual(expect.any(Array));
    expect(first.combat).toEqual(expect.objectContaining({ maxMana: expect.any(Number), potionUses: expect.any(Object) }));
  });

  it('bounds a batch and produces a balance report', () => {
    const batch = runScenarioBatch({ name: 'balance-sample', version: 'v1-expedition-loop', seed: 20, durationMilliseconds: 20_000 }, 3);

    expect(batch.results).toHaveLength(3);
    expect(batch.results.map((result) => result.seed)).toEqual([20, 21, 22]);
    expect(batch.report).toEqual(expect.objectContaining({ count: 3, scenario: 'balance-sample', version: 'v1-expedition-loop' }));
  });

  it('rejects malformed authored content and accepts the shipped content', () => {
    expect(validateContent(AREAS, SKILLS)).toMatchObject({ valid: true, issues: [] });
    const invalid = validateContent([{ ...AREAS[0], rooms: [{ type: 'combat', enemy: { name: 'missing-enemy', health: 1, attack: 1 }, experience: 0, currency: 0 }], encounterTable: [] }], SKILLS);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['empty-encounter-table', 'encounter-reference']));
  });

  it('detects impossible terminal states and replay drift', () => {
    const result = runScenario(GOLDEN_SCENARIOS[0]);
    expect(() => assertSimulationInvariants(result.state)).not.toThrow();
    expect(() => assertSimulationInvariants({ ...result.state, status: 'completed', outcome: null })).toThrow(/terminal outcome/);
    expect(() => assertGoldenScenarios()).not.toThrow();
    expect(() => assertScenarioDeterminism()).not.toThrow();
  });

  it('reports independent Area, Room, and encounter failures at their content paths', () => {
    const broken = [
      { ...AREAS[0], id: 'duplicate', rooms: [
        { type: 'combat' as const, enemy: { name: 'Missing', health: Number.NaN, attack: -1 }, experience: -1, currency: 0, championChance: 2 },
        { type: 'empty' as const, durationMilliseconds: 0, healthEffect: Number.POSITIVE_INFINITY, manaEffect: 0, experience: 0, currency: -1 },
      ], encounterTable: ['Meadow Slime', 'Meadow Slime'] },
      { ...AREAS[1], id: 'duplicate', unlock: { type: 'complete-area' as const, areaId: 'duplicate', completions: 0 } },
    ];
    const result = validateContent(broken, SKILLS);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'duplicate-id', 'duplicate-encounter', 'encounter-reference', 'invalid-room-values', 'invalid-unlock', 'unreachable-area',
    ]));
    expect(result.issues.some(({ path }) => path === 'areas[0].rooms[0].enemy.health')).toBe(true);
    expect(result.issues.some(({ path }) => path === 'areas[0].rooms[1].durationMilliseconds')).toBe(true);
  });

  it('rejects impossible Boss placement and Skill dependencies', () => {
    const areas = [{ ...AREAS[0], kind: 'boss' as const, boss: { name: 'Missing Boss' }, rooms: [AREAS[0].rooms[0]] }];
    const skills = [
      { ...SKILLS[0], id: 'loop-a', prerequisites: ['loop-b'] },
      { ...SKILLS[1], id: 'loop-b', prerequisites: ['loop-a', 'missing'] },
    ];
    const result = validateContent(areas, skills);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'boss-reference', 'boss-room', 'skill-reference', 'unreachable-skill',
    ]));
  });

  it('checks shared Item and Affix compatibility and reward bounds', () => {
    const result = validateContent(AREAS, SKILLS, {
      itemBases: { ...ITEM_BASES, 'bad-base': { name: 'Bad', slot: 'weapon', stats: { attack: Number.NaN } } },
      affixes: [...AFFIXES, { ...AFFIXES[0], id: 'might', value: Number.POSITIVE_INFINITY }],
      exceptionalItems: [...EXCEPTIONAL_ITEMS, { ...EXCEPTIONAL_ITEMS[0], id: 'bad-item', slot: 'weapon' }],
    });
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid-item-stat', 'duplicate-id', 'invalid-affix-value', 'affix-compatibility',
    ]));
  });

  it('fails clearly for non-finite Simulation state', () => {
    const state = runScenario(GOLDEN_SCENARIOS[0]).state;
    expect(() => assertSimulationInvariants({ ...state, hero: { ...state.hero, health: Number.NaN } })).toThrow(/Hero health/);
    expect(() => assertSimulationInvariants({ ...state, currency: -1 })).toThrow(/currency/);
  });

  it('reports unknown authored variants without losing other errors', () => {
    const invalid = validateContent([
      { ...AREAS[0], kind: 'unknown', unlock: { type: 'unknown' }, rooms: [{ type: 'mystery', experience: -1, currency: 0 }] },
    ] as unknown as typeof AREAS, [{ ...SKILLS[0], kind: 'unknown', tree: 'unknown' }] as unknown as typeof SKILLS);
    expect(invalid.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid-area-kind', 'invalid-unlock', 'invalid-room-type', 'invalid-room-values', 'invalid-skill-kind', 'invalid-skill-tree',
    ]));
  });

  it('requires the Boss to occupy the final Room', () => {
    const chapter = AREAS.find(({ kind }) => kind === 'boss')!;
    const misplaced = { ...chapter, rooms: [chapter.rooms[0], { type: 'empty' as const, durationMilliseconds: 100, healthEffect: 0, manaEffect: 0, experience: 0, currency: 0 }] };
    expect(validateContent([misplaced], SKILLS).issues.map(({ code }) => code)).toContain('boss-room');
  });

  it('collects independent errors when nested authored fields are missing', () => {
    const brokenArea = { ...AREAS[0], rooms: [{ type: 'combat', experience: -1, currency: 0 }], encounterTable: undefined, unlock: undefined };
    const brokenSkill = { ...SKILLS[0], prerequisites: undefined };
    const result = validateContent([brokenArea] as unknown as typeof AREAS, [brokenSkill] as unknown as typeof SKILLS);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid-prerequisites', 'invalid-encounter-table', 'invalid-unlock', 'missing-enemy', 'invalid-room-values',
    ]));
    expect(result.issues.some(({ path }) => path === 'areas[0].rooms[0].enemy')).toBe(true);
  });

  it('reports a malformed Exceptional Item alongside other catalog errors', () => {
    const brokenItem = { ...EXCEPTIONAL_ITEMS[0], affixes: undefined };
    const result = validateContent(AREAS, SKILLS, {
      itemBases: { ...ITEM_BASES, broken: { name: 'Broken', slot: 'weapon', stats: { attack: -1 } } },
      affixes: AFFIXES,
      exceptionalItems: [brokenItem],
    } as unknown as Parameters<typeof validateContent>[2]);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(['invalid-affixes', 'invalid-item-stat']));
  });
});
