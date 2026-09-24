export { validateContent } from './content-validation';
import { createGame, dispatch, SIMULATION_VERSION } from './simulation';
import type { BalanceReport, GameState, SimulationBatch, SimulationResult, SimulationScenario } from './types';

const MAX_BATCH_SIZE = 1_000;

export const GOLDEN_SCENARIOS: SimulationScenario[] = [
  { name: 'first-expedition', version: SIMULATION_VERSION, seed: 7, durationMilliseconds: 20_000 },
  { name: 'short-defeat', version: SIMULATION_VERSION, seed: 7, durationMilliseconds: 2_000, createGameOptions: { startingHealth: 1, enemyAttack: 100 } },
];

type GoldenExpectation = { seed: number; outcome: SimulationResult['outcome']; level: number; experience: number; committedCurrency: number; inventoryCount: number };

const GOLDEN_EXPECTATIONS: GoldenExpectation[] = [
  { seed: 7, outcome: { result: 'completed', areaName: 'Sunlit Meadow', roomReached: 3, committed: { experience: 30, currency: 6 }, lost: { experience: 0, currency: 0 }, recoveryMilliseconds: 0, willRestart: true, consumables: { potionsUsed: {}, timedBuff: null } }, level: 1, experience: 30, committedCurrency: 0, inventoryCount: 3 },
  { seed: 7, outcome: { result: 'defeated', areaName: 'Sunlit Meadow', roomReached: 1, committed: { experience: 0, currency: 0 }, lost: { experience: 10, currency: 2 }, recoveryMilliseconds: 3_000, willRestart: true, consumables: { potionsUsed: { health: 1 }, timedBuff: null } }, level: 1, experience: 0, committedCurrency: 0, inventoryCount: 0 },
];

function resultFromState(scenario: SimulationScenario, state: GameState): SimulationResult {
  return {
    scenario: scenario.name,
    version: scenario.version,
    seed: scenario.seed,
    durationMilliseconds: scenario.durationMilliseconds,
    outcome: state.outcome,
    progression: {
      level: state.progression.level,
      experience: state.progression.experience,
      attributePoints: state.progression.attributePoints,
      skillPoints: state.progression.skillPoints,
    },
    combat: {
      heroAttackProgress: state.combat.heroAttackProgress,
      enemyAttackProgress: state.combat.enemyAttackProgress,
      heroMana: state.combat.heroMana,
      maxMana: state.combat.maxMana,
      heroManaRegeneration: state.combat.heroManaRegeneration,
      heroHealthRegeneration: state.combat.heroHealthRegeneration,
      heroDefense: state.combat.heroDefense,
      potionUses: state.combat.potionUses,
    },
    loot: {
      inventoryCount: state.inventory.length,
      itemIds: state.inventory.map((item) => item.id),
      items: state.inventory.map(({ id, slot, quality, exceptional }) => ({ id, slot, quality, exceptional })),
      currency: state.currency,
      committedCurrency: state.committed.currency,
    },
    state,
  };
}

export function runScenario(scenario: SimulationScenario): SimulationResult {
  if (!scenario.name.trim()) throw new Error('Simulation scenario name must not be empty');
  if (!scenario.version.trim()) throw new Error('Simulation scenario version must not be empty');
  if (!Number.isInteger(scenario.seed)) throw new Error('Simulation scenario seed must be an integer');
  if (!Number.isFinite(scenario.durationMilliseconds) || scenario.durationMilliseconds < 0) throw new Error('Simulation scenario duration must be non-negative');

  let state = prepareScenario(scenario);
  state = dispatch(state, { type: 'ADVANCE_TIME', milliseconds: scenario.durationMilliseconds });
  assertSimulationInvariants(state);
  return resultFromState(scenario, state);
}

export function prepareScenario(scenario: SimulationScenario): GameState {
  let state = createGame(scenario.seed, scenario.createGameOptions);
  for (const command of scenario.commands ?? []) state = dispatch(state, command);
  if (state.status === 'preparation' && !(scenario.commands ?? []).some((command) => command.type === 'START_EXPEDITION')) {
    state = dispatch(state, { type: 'START_EXPEDITION' });
  }
  return state;
}

function reportFor(scenario: SimulationScenario, results: SimulationResult[]): BalanceReport {
  const completed = results.filter((result) => result.outcome?.result === 'completed').length;
  const withdrawn = results.filter((result) => result.outcome?.result === 'withdrawn').length;
  const defeated = results.filter((result) => result.outcome?.result === 'defeated').length;
  const total = results.length || 1;
  return {
    scenario: scenario.name,
    version: scenario.version,
    count: results.length,
    completed,
    withdrawn,
    defeated,
    incomplete: results.length - completed - withdrawn - defeated,
    completionRate: completed / total,
    averageDurationMilliseconds: results.reduce((sum, result) => sum + result.state.elapsedMilliseconds, 0) / total,
    averageCommittedExperience: results.reduce((sum, result) => sum + result.progression.experience, 0) / total,
    averageCommittedCurrency: results.reduce((sum, result) => sum + result.loot.committedCurrency, 0) / total,
    lootItemCount: results.reduce((sum, result) => sum + result.loot.inventoryCount, 0),
  };
}

export function runScenarioBatch(scenario: SimulationScenario, count: number): SimulationBatch {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_SIZE) throw new Error(`Simulation batch count must be between 1 and ${MAX_BATCH_SIZE}`);
  const results = Array.from({ length: count }, (_, index) => runScenario({ ...scenario, seed: scenario.seed + index }));
  return { results, report: reportFor(scenario, results) };
}

export function assertSimulationInvariants(state: GameState): void {
  if (state.status === 'active' && state.outcome !== null && state.outcome.result !== 'completed') throw new Error('Active Simulation cannot have a defeated or withdrawn outcome');
  if (['completed', 'withdrawn', 'defeated'].includes(state.status) && state.outcome === null) throw new Error('Terminal Simulation status requires a terminal outcome');
  if (state.outcome && state.outcome.result !== state.status && !(state.status === 'recovery' && state.outcome.result === 'defeated') && !(state.status === 'active' && state.outcome.result === 'completed') && !(state.status === 'preparation' && ['completed', 'withdrawn'].includes(state.outcome.result))) throw new Error('Terminal outcome does not match Simulation status');
  if (!Number.isFinite(state.hero.health) || !Number.isFinite(state.hero.maxHealth) || state.hero.maxHealth <= 0 || state.hero.health < 0 || state.hero.health > state.hero.maxHealth) throw new Error('Hero health is outside its valid bounds');
  if (!Number.isFinite(state.combat.heroMana) || !Number.isFinite(state.combat.maxMana) || state.combat.maxMana < 0 || state.combat.heroMana < 0 || state.combat.heroMana > state.combat.maxMana) throw new Error('Hero Mana is outside its valid bounds');
  if (!Number.isInteger(state.roomIndex) || !Number.isInteger(state.roomCount) || state.roomCount < 1 || state.roomIndex < 0 || state.roomIndex > state.roomCount) throw new Error('Room progression is outside its valid bounds');
  if (!Number.isFinite(state.currency) || state.currency < 0) throw new Error('Persistent currency is outside its valid bounds');
  if (!Number.isFinite(state.committed.experience) || state.committed.experience < 0 || !Number.isFinite(state.committed.currency) || state.committed.currency < 0) throw new Error('Committed rewards are outside their valid bounds');
  if (!Number.isFinite(state.elapsedMilliseconds) || state.elapsedMilliseconds < 0 || !Number.isFinite(state.recoveryRemainingMilliseconds) || state.recoveryRemainingMilliseconds < 0) throw new Error('Simulation timing is outside its valid bounds');
  if (state.inventory.length > 12) throw new Error('Inventory exceeds its bounded capacity');
}

export function assertGoldenScenarios(): void {
  GOLDEN_SCENARIOS.forEach((scenario, index) => {
    const result = runScenario(scenario);
    const expected = GOLDEN_EXPECTATIONS[index];
    if (JSON.stringify({ seed: result.seed, outcome: result.outcome, level: result.progression.level, experience: result.progression.experience, committedCurrency: result.loot.committedCurrency, inventoryCount: result.loot.inventoryCount }) !== JSON.stringify(expected)) {
      throw new Error(`Golden scenario drift detected for ${scenario.name}; update the expected result intentionally`);
    }
  });
}

export function assertScenarioDeterminism(scenarios: SimulationScenario[] = GOLDEN_SCENARIOS): void {
  for (const scenario of scenarios) {
    const first = runScenario(scenario);
    const replay = runScenario(scenario);
    if (JSON.stringify(first) !== JSON.stringify(replay)) throw new Error(`Simulation replay drift detected for ${scenario.name} with seed ${scenario.seed}`);
  }
}
