import { AREAS, REGION_BOSS_ID } from './content';
import { assertAuthoredContentValid } from './content-validation';
import { BALANCE_CHECKPOINTS, offlineAgrees } from './balance';
import { assertGoldenScenarios, assertScenarioDeterminism, assertSimulationInvariants, GOLDEN_SCENARIOS, runScenario } from './runner';
import { deserializeSave, serializeSave } from './save';
import { createGame, dispatch, getAreaMap } from './simulation';
import type { GameState } from './types';

export function assertProgressionPossible(state: GameState, requiredAreaId?: string): void {
  if (!Number.isInteger(state.progression.level) || state.progression.level < 1 || state.progression.level > 100
    || !Number.isFinite(state.progression.experience) || state.progression.experience < 0
    || !Number.isInteger(state.progression.attributePoints) || state.progression.attributePoints < 0
    || !Number.isInteger(state.progression.skillPoints) || state.progression.skillPoints < 0) throw new Error('Hero progression is impossible');
  for (const [areaId, progress] of Object.entries(state.areaProgress)) {
    if (!AREAS.some(({ id }) => id === areaId) || !Number.isInteger(progress.completions) || progress.completions < 0) throw new Error(`Area progression is impossible for ${areaId}`);
  }
  const selected = getAreaMap(state).find(({ id }) => id === state.selectedAreaId);
  if (!selected || selected.status === 'locked') throw new Error(`Selected Area ${state.selectedAreaId} is unreachable`);
  if (requiredAreaId && (state.areaProgress[requiredAreaId]?.completions ?? 0) < 1) throw new Error(`Impossible progression: required Area ${requiredAreaId} was not completed`);
}

/** Check every authored unlock at the actual Area selection boundary. */
export function assertAreaRouteAvailable(): void {
  for (const area of AREAS) {
    if (area.unlock.type === 'start') continue;
    const start = createGame(7);
    const locked = dispatch(start, { type: 'SELECT_AREA', areaId: area.id });
    if (locked.selectedAreaId === area.id) throw new Error(`Area ${area.id} skipped its unlock requirement`);
    const unlocked: GameState = {
      ...start,
      areaProgress: { ...start.areaProgress, [area.unlock.areaId]: { completions: area.unlock.completions } },
      currency: area.attemptCost ?? 0,
    };
    if (area.id === REGION_BOSS_ID) {
      const short = dispatch({ ...unlocked, currency: (area.attemptCost ?? 0) - 1 }, { type: 'SELECT_AREA', areaId: area.id });
      if (short.selectedAreaId === area.id) throw new Error('Region Boss skipped its currency gate');
    }
    const selected = dispatch(unlocked, { type: 'SELECT_AREA', areaId: area.id });
    if (selected.selectedAreaId !== area.id || selected.currency !== unlocked.currency - (area.attemptCost ?? 0)) {
      throw new Error(`Area ${area.id} cannot be selected after meeting its unlock requirements`);
    }
  }
}

export function runDeveloperChecks(): void {
  assertAuthoredContentValid();
  assertAreaRouteAvailable();
  assertGoldenScenarios();
  const scenarios = [
    ...GOLDEN_SCENARIOS.map((scenario) => ({ scenario, requiredAreaId: undefined as string | undefined })),
    ...BALANCE_CHECKPOINTS.flatMap(({ scenario, count, requiredAreaId }) => Array.from({ length: count }, (_, index) => ({ scenario: { ...scenario, seed: scenario.seed + index }, requiredAreaId }))),
  ];
  assertScenarioDeterminism(scenarios.map(({ scenario }) => scenario));
  for (const { scenario, requiredAreaId } of scenarios) {
    const result = runScenario(scenario);
    assertSimulationInvariants(result.state);
    assertProgressionPossible(result.state, requiredAreaId);
    const saved = serializeSave(result.state);
    const loaded = deserializeSave(saved);
    assertSimulationInvariants(loaded);
    assertProgressionPossible(loaded);
    if (serializeSave(loaded) !== saved) throw new Error(`Save/load divergence in ${scenario.name}`);
    const durable = (state: GameState) => ({ selectedAreaId: state.selectedAreaId, areaProgress: state.areaProgress, progression: state.progression, currency: state.currency, inventory: state.inventory, equipment: state.equipment, consumables: state.consumables, outcomeHistory: state.outcomeHistory });
    if (JSON.stringify(durable(result.state)) !== JSON.stringify(durable(loaded))) throw new Error(`Durable save/load divergence in ${scenario.name}`);

    if (!offlineAgrees(scenario)) throw new Error(`Offline divergence in ${scenario.name}`);
  }
}
