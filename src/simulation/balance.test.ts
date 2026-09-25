import { describe, expect, it } from 'vitest';
import { buildBalanceReport, renderBalanceMarkdown } from './balance';
import { assertAreaRouteAvailable, assertProgressionPossible, runDeveloperChecks } from './developer-checks';
import { createGame } from './simulation';

describe('developer Balance report', () => {
  it('reports named checkpoints and all required systems in JSON and Markdown', () => {
    const report = buildBalanceReport();
    expect(report.checkpoints.map(({ name }) => name)).toEqual(['opening-expedition', 'early-progression', 'next-area', 'withdrawal', 'recovery']);
    const opening = report.checkpoints[0];
    expect(opening.metrics.outcomes.completed).toBeGreaterThan(0);
    expect(opening.metrics.progression.averageExperience).toBeGreaterThan(0);
    expect(opening.metrics.combat.averageAttackIntervalMilliseconds).toBeGreaterThan(0);
    expect(opening.metrics.combat.observedAttackIntervalMilliseconds).toBeGreaterThan(0);
    expect(opening.metrics.combat.observedAttackIntervalMilliseconds).toBeLessThan(2_000);
    expect(Object.keys(opening.metrics.loot.qualityCounts).sort()).toEqual(['Common', 'Epic', 'Legendary', 'Rare', 'Uncommon']);
    expect(opening.metrics.inventory.averageOccupancy).toBeGreaterThan(0);
    expect(report.checkpoints[1].metrics.progression.averageLevel).toBeGreaterThan(1);
    expect(report.checkpoints[1].metrics.inventory.pressureRate).toBe(1);
    expect(report.checkpoints[2].metrics.progression.areaCompletions['moonlit-grove']).toBeGreaterThan(0);
    expect(report.checkpoints[3].metrics.outcomes.withdrawn).toBeGreaterThan(0);
    expect(report.checkpoints[4].metrics.recovery.defeats).toBeGreaterThan(0);
    expect(opening.metrics.offline.agreementRate).toBe(1);
    expect(opening.targets.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const markdown = renderBalanceMarkdown(report);
    expect(markdown).toContain('opening-expedition');
    expect(markdown).toContain('Advisory warnings');
    expect(markdown).toContain('Item quality');
    expect(markdown).toContain('Offline agreement');
  });

  it('keeps a balance deviation advisory', () => {
    const report = buildBalanceReport([{ name: 'strict-band', scenario: { name: 'strict-band', version: 'v1-expedition-loop', seed: 7, durationMilliseconds: 120_000 }, count: 1, targets: { completionRate: { min: 2, max: 2 } } }]);
    expect(report.warnings).toEqual([expect.objectContaining({ checkpoint: 'strict-band', metric: 'completionRate' })]);
    expect(() => runDeveloperChecks()).not.toThrow();
  });

  it('hard-fails impossible Hero and Area progression', () => {
    const state = createGame(7);
    expect(() => assertProgressionPossible({ ...state, progression: { ...state.progression, level: -1 } })).toThrow(/Hero progression/);
    expect(() => assertProgressionPossible({ ...state, areaProgress: { ...state.areaProgress, 'sunlit-meadow': { completions: -1 } } })).toThrow(/Area progression/);
    expect(() => assertProgressionPossible({ ...state, selectedAreaId: 'region-area-20' })).toThrow(/unreachable/);
    expect(() => assertProgressionPossible(state, 'moonlit-grove')).toThrow(/required Area/);
    expect(() => assertAreaRouteAvailable()).not.toThrow();
  });
});
