import { describe, expect, it } from 'vitest';
import { AREAS, SKILLS } from './content';
import { GOLDEN_SCENARIOS, assertSimulationInvariants, assertGoldenScenarios, runScenario, runScenarioBatch, validateContent } from './runner';

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
  });
});
