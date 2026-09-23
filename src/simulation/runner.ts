import { AREAS, SKILLS } from './content';
import { createGame, dispatch, SIMULATION_VERSION } from './simulation';
import type { AreaDefinition, BalanceReport, Command, ContentValidationIssue, ContentValidationResult, GameState, SimulationBatch, SimulationResult, SimulationScenario, SkillDefinition } from './types';

const MAX_BATCH_SIZE = 1_000;

export const GOLDEN_SCENARIOS: SimulationScenario[] = [
  { name: 'first-expedition', version: SIMULATION_VERSION, seed: 7, durationMilliseconds: 20_000 },
  { name: 'short-defeat', version: SIMULATION_VERSION, seed: 7, durationMilliseconds: 2_000, createGameOptions: { startingHealth: 1, enemyAttack: 100 } },
];

type GoldenExpectation = { seed: number; outcome: SimulationResult['outcome']; level: number; experience: number; committedCurrency: number; inventoryCount: number };

const GOLDEN_EXPECTATIONS: GoldenExpectation[] = [
  { seed: 7, outcome: { result: 'completed', roomReached: 3, committed: { experience: 30, currency: 6 }, lost: { experience: 0, currency: 0 }, recoveryMilliseconds: 0, willRestart: false, consumables: { potionsUsed: {}, timedBuff: null } }, level: 1, experience: 30, committedCurrency: 0, inventoryCount: 3 },
  { seed: 7, outcome: { result: 'defeated', roomReached: 1, committed: { experience: 0, currency: 0 }, lost: { experience: 10, currency: 2 }, recoveryMilliseconds: 3_000, willRestart: true, consumables: { potionsUsed: { health: 1 }, timedBuff: null } }, level: 1, experience: 0, committedCurrency: 0, inventoryCount: 0 },
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

  let state = createGame(scenario.seed, scenario.createGameOptions);
  for (const command of scenario.commands ?? []) state = dispatch(state, command);
  if (state.status === 'preparation' && !(scenario.commands ?? []).some((command) => command.type === 'START_EXPEDITION')) {
    state = dispatch(state, { type: 'START_EXPEDITION' });
  }
  state = dispatch(state, { type: 'ADVANCE_TIME', milliseconds: scenario.durationMilliseconds });
  assertSimulationInvariants(state);
  return resultFromState(scenario, state);
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

function issue(code: string, message: string, path?: string): ContentValidationIssue { return { code, message, path }; }

export function validateContent(areas: AreaDefinition[] = AREAS, skills: SkillDefinition[] = SKILLS): ContentValidationResult {
  const issues: ContentValidationIssue[] = [];
  const areaIds = new Set<string>();
  const skillIds = new Set<string>();
  for (const skill of skills) {
    if (!skill.id.trim()) issues.push(issue('empty-id', 'Skill id must not be empty', 'skills'));
    if (skillIds.has(skill.id)) issues.push(issue('duplicate-id', `Duplicate skill id: ${skill.id}`, `skills.${skill.id}`));
    skillIds.add(skill.id);
    if (skill.maxRank < 1 || skill.unlockLevel < 1 || skill.manaCost < 0 || skill.cooldownMilliseconds < 0) issues.push(issue('invalid-skill-values', `Skill ${skill.id} has an invalid rank, unlock, cost, or cooldown`, `skills.${skill.id}`));
    for (const prerequisite of skill.prerequisites) if (!skillIds.has(prerequisite) && !skills.some((candidate) => candidate.id === prerequisite)) issues.push(issue('skill-reference', `Skill ${skill.id} references missing prerequisite ${prerequisite}`, `skills.${skill.id}`));
  }
  for (const area of areas) {
    if (!area.id.trim()) issues.push(issue('empty-id', 'Area id must not be empty', 'areas'));
    if (areaIds.has(area.id)) issues.push(issue('duplicate-id', `Duplicate area id: ${area.id}`, `areas.${area.id}`));
    areaIds.add(area.id);
    if (area.rooms.length === 0) issues.push(issue('empty-rooms', `Area ${area.id} must contain at least one Room`, `areas.${area.id}.rooms`));
    if (area.rooms.length > 100) issues.push(issue('room-safety-bound', `Area ${area.id} exceeds the 100 Room safety bound`, `areas.${area.id}.rooms`));
    if (area.encounterTable.length === 0) issues.push(issue('empty-encounter-table', `Area ${area.id} must contain an encounter table`, `areas.${area.id}.encounterTable`));
    const encounterNames = new Set(area.encounterTable);
    for (const room of area.rooms) {
      if (room.type === 'combat' && !encounterNames.has(room.enemy.name)) issues.push(issue('encounter-reference', `Room enemy ${room.enemy.name} is missing from ${area.id}'s encounter table`, `areas.${area.id}.rooms`));
      if (room.type === 'combat' && (room.enemy.health <= 0 || room.enemy.attack < 0 || room.experience < 0 || room.currency < 0)) issues.push(issue('invalid-room-values', `Area ${area.id} contains invalid Combat or reward values`, `areas.${area.id}.rooms`));
      if (room.type === 'empty' && (room.durationMilliseconds < 0 || room.experience < 0 || room.currency < 0)) issues.push(issue('invalid-room-values', `Area ${area.id} contains invalid Empty Room values`, `areas.${area.id}.rooms`));
    }
    const unlock = area.unlock;
    if (unlock.type === 'complete-area' && !areas.some((candidate) => candidate.id === unlock.areaId)) issues.push(issue('area-reference', `Area ${area.id} references missing unlock Area ${unlock.areaId}`, `areas.${area.id}.unlock`));
    if (unlock.type === 'complete-area' && (!Number.isInteger(unlock.completions) || unlock.completions < 1)) issues.push(issue('invalid-unlock', `Area ${area.id} has an invalid completion requirement`, `areas.${area.id}.unlock`));
    if (area.kind === 'boss' && !area.boss) issues.push(issue('boss-definition', `Boss Area ${area.id} must define a Boss`, `areas.${area.id}`));
    if (area.kind === 'boss' && area.boss && !encounterNames.has(area.boss.name)) issues.push(issue('boss-reference', `Boss ${area.boss.name} is missing from ${area.id}'s encounter table`, `areas.${area.id}.boss`));
  }
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const areaReachable = (areaId: string, visiting = new Set<string>()): boolean => {
    const area = areaById.get(areaId);
    if (!area) return false;
    if (area.unlock.type === 'start') return true;
    if (visiting.has(areaId)) return false;
    visiting.add(areaId);
    return areaReachable(area.unlock.areaId, visiting);
  };
  for (const area of areas) if (!areaReachable(area.id)) issues.push(issue('unreachable-area', `Area ${area.id} cannot be reached from a start Area`, `areas.${area.id}`));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const skillReachable = (skillId: string, visiting = new Set<string>()): boolean => {
    const skill = skillById.get(skillId);
    if (!skill) return false;
    if (skill.prerequisites.length === 0) return true;
    if (visiting.has(skillId)) return false;
    visiting.add(skillId);
    return skill.prerequisites.every((prerequisite) => skillReachable(prerequisite, new Set(visiting)));
  };
  for (const skill of skills) if (!skillReachable(skill.id)) issues.push(issue('unreachable-skill', `Skill ${skill.id} has an unreachable prerequisite chain`, `skills.${skill.id}`));
  return { valid: issues.length === 0, issues };
}

export function assertSimulationInvariants(state: GameState): void {
  if (state.status === 'active' && state.outcome !== null && state.outcome.result !== 'completed') throw new Error('Active Simulation cannot have a defeated or withdrawn outcome');
  if (['completed', 'withdrawn', 'defeated'].includes(state.status) && state.outcome === null) throw new Error('Terminal Simulation status requires a terminal outcome');
  if (state.outcome && state.outcome.result !== state.status && !(state.status === 'recovery' && state.outcome.result === 'defeated') && !(state.status === 'active' && state.outcome.result === 'completed')) throw new Error('Terminal outcome does not match Simulation status');
  if (state.hero.health < 0 || state.hero.health > state.hero.maxHealth) throw new Error('Hero health is outside its valid bounds');
  if (state.combat.heroMana < 0 || state.combat.heroMana > state.combat.maxMana) throw new Error('Hero Mana is outside its valid bounds');
  if (state.roomIndex < 0 || state.roomIndex > state.roomCount) throw new Error('Room progression is outside its valid bounds');
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
