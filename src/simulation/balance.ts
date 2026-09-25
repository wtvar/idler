import { advanceOffline } from './offline';
import { prepareScenario, runScenarioBatch } from './runner';
import { dispatch, INVENTORY_CAPACITY, SIMULATION_VERSION } from './simulation';
import type { GameState, ItemQuality, SimulationResult, SimulationScenario } from './types';

type Band = { min: number; max: number };
export type Checkpoint = { name: string; scenario: SimulationScenario; count: number; requiredAreaId?: string; targets: Partial<Record<MetricName, Band>> };
type MetricName = 'completionRate' | 'withdrawalRate' | 'defeatRate' | 'averageLevel' | 'averageItems' | 'inventoryPressure' | 'offlineAgreementRate';
type Metrics = {
  outcomes: { completed: number; withdrawn: number; defeated: number; incomplete: number; completionRate: number; withdrawalRate: number; defeatRate: number };
  progression: { averageLevel: number; averageExperience: number; averageCurrency: number; areaCompletions: Record<string, number> };
  combat: { averageAttackIntervalMilliseconds: number; observedAttackIntervalMilliseconds: number; averageManaRemaining: number; potionUses: number };
  loot: { totalItems: number; averageItems: number; qualityCounts: Record<ItemQuality, number> };
  inventory: { averageOccupancy: number; pressureRate: number };
  recovery: { defeats: number; averageRecoveryMilliseconds: number };
  offline: { agreements: number; agreementRate: number };
};
export type CheckpointReport = { name: string; version: string; seeds: number[]; metrics: Metrics; targets: Array<{ metric: MetricName; observed: number; min: number; max: number; withinBand: boolean }> };
export type BalanceReportDocument = { simulationVersion: string; checkpoints: CheckpointReport[]; warnings: Array<{ checkpoint: string; metric: MetricName; observed: number; min: number; max: number }> };

export const BALANCE_CHECKPOINTS: Checkpoint[] = [
  { name: 'opening-expedition', scenario: { name: 'opening-expedition', version: SIMULATION_VERSION, seed: 7, durationMilliseconds: 120_000 }, count: 5, targets: { completionRate: { min: 0.5, max: 1 }, averageItems: { min: 1, max: 12 }, offlineAgreementRate: { min: 1, max: 1 } } },
  { name: 'early-progression', scenario: { name: 'early-progression', version: SIMULATION_VERSION, seed: 17, durationMilliseconds: 30_000, commands: [{ type: 'START_EXPEDITION' }, { type: 'ADVANCE_TIME', milliseconds: 20_000 }, { type: 'ADVANCE_TIME', milliseconds: 20_000 }, { type: 'ADVANCE_TIME', milliseconds: 20_000 }] }, count: 5, targets: { averageLevel: { min: 2, max: 5 }, inventoryPressure: { min: 0.8, max: 1 }, offlineAgreementRate: { min: 1, max: 1 } } },
  { name: 'next-area', scenario: { name: 'next-area', version: SIMULATION_VERSION, seed: 41, durationMilliseconds: 180_000, commands: [{ type: 'SET_AUTO_REPEAT', enabled: false }, { type: 'START_EXPEDITION' }, { type: 'ADVANCE_TIME', milliseconds: 120_000 }, { type: 'SELECT_AREA', areaId: 'moonlit-grove' }, { type: 'START_EXPEDITION' }] }, count: 3, requiredAreaId: 'moonlit-grove', targets: { completionRate: { min: 0.8, max: 1 }, offlineAgreementRate: { min: 1, max: 1 } } },
  { name: 'withdrawal', scenario: { name: 'withdrawal', version: SIMULATION_VERSION, seed: 23, durationMilliseconds: 0, commands: [{ type: 'START_EXPEDITION' }, { type: 'ADVANCE_TIME', milliseconds: 5_000 }, { type: 'WITHDRAW' }] }, count: 3, targets: { withdrawalRate: { min: 1, max: 1 } } },
  { name: 'recovery', scenario: { name: 'recovery', version: SIMULATION_VERSION, seed: 31, durationMilliseconds: 2_000, createGameOptions: { startingHealth: 1, enemyAttack: 100 } }, count: 3, targets: { defeatRate: { min: 0.5, max: 1 }, offlineAgreementRate: { min: 1, max: 1 } } },
];

export function offlineAgrees(scenario: SimulationScenario): boolean {
  const start = prepareScenario(scenario);
  let active = start;
  let remaining = scenario.durationMilliseconds;
  while (remaining > 0 && (active.status === 'active' || active.status === 'recovery')) {
    const step = Math.min(100, remaining);
    const previousStatus: GameState['status'] = active.status;
    active = dispatch(active, { type: 'ADVANCE_TIME', milliseconds: step });
    remaining -= step;
    if (previousStatus === 'recovery' && active.status === 'preparation') break;
  }
  const offline = advanceOffline(start, scenario.durationMilliseconds);
  return offline.summary.elapsedMilliseconds === scenario.durationMilliseconds - remaining && JSON.stringify(active) === JSON.stringify(offline.state);
}

function metricsFor(results: SimulationResult[], scenarios: SimulationScenario[]): Metrics {
  const count = results.length;
  const outcomes = results.flatMap(({ state }) => state.outcomeHistory);
  const completed = outcomes.filter(({ result }) => result === 'completed').length;
  const withdrawn = outcomes.filter(({ result }) => result === 'withdrawn').length;
  const defeated = outcomes.filter(({ result }) => result === 'defeated').length;
  const allItems = results.flatMap(({ state }) => state.inventory);
  const qualityCounts: Record<ItemQuality, number> = { Common: 0, Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0 };
  for (const item of allItems) qualityCounts[item.quality] += 1;
  const average = (value: (result: SimulationResult) => number) => results.reduce((sum, result) => sum + value(result), 0) / count;
  const outcomeCount = outcomes.length || 1;
  const agreements = scenarios.filter(offlineAgrees).length;
  const areaCompletions: Record<string, number> = {};
  for (const { state } of results) for (const [id, progress] of Object.entries(state.areaProgress)) {
    if (progress.completions > 0) areaCompletions[id] = (areaCompletions[id] ?? 0) + progress.completions;
  }
  const attackIntervals = results.flatMap(({ state }) => {
    const names = [ `${state.hero.name} attacks `, ...state.skills.map(({ name }) => `${name} attacks `) ];
    const times = state.events.filter(({ message }) => names.some((name) => message.startsWith(name))).map(({ timestampMilliseconds }) => timestampMilliseconds);
    return times.slice(1).map((time, index) => time - times[index]).filter((interval) => interval > 0 && interval <= 10_000);
  });
  return {
    outcomes: { completed, withdrawn, defeated, incomplete: results.filter(({ state }) => state.status === 'active').length, completionRate: completed / outcomeCount, withdrawalRate: withdrawn / outcomeCount, defeatRate: defeated / outcomeCount },
    progression: { averageLevel: average(({ progression }) => progression.level), averageExperience: average(({ progression }) => progression.experience), averageCurrency: outcomes.reduce((sum, outcome) => sum + outcome.committed.currency, 0) / count, areaCompletions },
    combat: { averageAttackIntervalMilliseconds: average(({ state }) => state.hero.attackInterval), observedAttackIntervalMilliseconds: attackIntervals.length ? attackIntervals.reduce((sum, interval) => sum + interval, 0) / attackIntervals.length : 0, averageManaRemaining: average(({ combat }) => combat.heroMana), potionUses: outcomes.reduce((sum, outcome) => sum + Object.values(outcome.consumables.potionsUsed).reduce((used, quantity) => used + quantity, 0), 0) },
    loot: { totalItems: allItems.length, averageItems: allItems.length / count, qualityCounts },
    inventory: { averageOccupancy: allItems.length / (count * INVENTORY_CAPACITY), pressureRate: results.filter(({ state }) => state.inventory.length === INVENTORY_CAPACITY).length / count },
    recovery: { defeats: defeated, averageRecoveryMilliseconds: defeated ? outcomes.filter(({ result }) => result === 'defeated').reduce((sum, outcome) => sum + outcome.recoveryMilliseconds, 0) / defeated : 0 },
    offline: { agreements, agreementRate: agreements / count },
  };
}

function observedMetric(metrics: Metrics, name: MetricName): number {
  switch (name) {
    case 'completionRate': return metrics.outcomes.completionRate;
    case 'withdrawalRate': return metrics.outcomes.withdrawalRate;
    case 'defeatRate': return metrics.outcomes.defeatRate;
    case 'averageLevel': return metrics.progression.averageLevel;
    case 'averageItems': return metrics.loot.averageItems;
    case 'inventoryPressure': return metrics.inventory.pressureRate;
    case 'offlineAgreementRate': return metrics.offline.agreementRate;
  }
}

export function buildBalanceReport(checkpoints: Checkpoint[] = BALANCE_CHECKPOINTS): BalanceReportDocument {
  const reports = checkpoints.map((checkpoint): CheckpointReport => {
    const { results } = runScenarioBatch(checkpoint.scenario, checkpoint.count);
    const metrics = metricsFor(results, results.map(({ seed }) => ({ ...checkpoint.scenario, seed })));
    const targets = Object.entries(checkpoint.targets).map(([metric, band]) => {
      const observed = observedMetric(metrics, metric as MetricName);
      return { metric: metric as MetricName, observed, ...band, withinBand: observed >= band.min && observed <= band.max };
    });
    return { name: checkpoint.name, version: checkpoint.scenario.version, seeds: results.map(({ seed }) => seed), metrics, targets };
  });
  return { simulationVersion: SIMULATION_VERSION, checkpoints: reports, warnings: reports.flatMap(({ name, targets }) => targets.filter(({ withinBand }) => !withinBand).map(({ metric, observed, min, max }) => ({ checkpoint: name, metric, observed, min, max }))) };
}

export function renderBalanceMarkdown(report: BalanceReportDocument): string {
  const lines = [`# Balance report`, '', `Simulation: ${report.simulationVersion}`, ''];
  for (const checkpoint of report.checkpoints) {
    const { metrics } = checkpoint;
    lines.push(`## ${checkpoint.name}`, '', `Seeds: ${checkpoint.seeds.join(', ')}`, '',
      `- Expedition outcomes: ${metrics.outcomes.completed} completed, ${metrics.outcomes.withdrawn} withdrawn, ${metrics.outcomes.defeated} defeated; ${metrics.outcomes.incomplete} active at sample end.`,
      `- Progression: level ${metrics.progression.averageLevel.toFixed(2)} average; ${metrics.progression.averageExperience.toFixed(1)} XP and ${metrics.progression.averageCurrency.toFixed(1)} committed currency average. Area completions: ${Object.entries(metrics.progression.areaCompletions).map(([id, count]) => `${id} ${count}`).join(', ') || 'none'}.`,
      `- Combat: ${metrics.combat.averageAttackIntervalMilliseconds.toFixed(0)} ms configured attack interval, ${metrics.combat.observedAttackIntervalMilliseconds.toFixed(0)} ms observed attack cadence, ${metrics.combat.averageManaRemaining.toFixed(1)} Mana remaining, ${metrics.combat.potionUses} Potions used.`,
      `- Loot: ${metrics.loot.totalItems} retained Items; Item quality ${Object.entries(metrics.loot.qualityCounts).map(([quality, count]) => `${quality} ${count}`).join(', ')}.`,
      `- Inventory: ${(metrics.inventory.averageOccupancy * 100).toFixed(1)}% average occupancy; ${(metrics.inventory.pressureRate * 100).toFixed(1)}% full.`,
      `- Recovery: ${metrics.recovery.defeats} Defeats; ${metrics.recovery.averageRecoveryMilliseconds.toFixed(0)} ms average.`,
      `- Offline agreement: ${metrics.offline.agreements}/${checkpoint.seeds.length}.`,
      `- Targets: ${checkpoint.targets.map(({ metric, observed, min, max, withinBand }) => `${metric} ${observed.toFixed(2)} [${min}, ${max}] ${withinBand ? 'within' : 'outside'}`).join('; ')}.`, '');
  }
  lines.push('## Advisory warnings', '', ...(report.warnings.length ? report.warnings.map(({ checkpoint, metric, observed, min, max }) => `- ${checkpoint}: ${metric} ${observed.toFixed(2)} outside [${min}, ${max}].`) : ['None.']), '');
  return lines.join('\n');
}
