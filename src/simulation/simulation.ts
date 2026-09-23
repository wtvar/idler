import { FIRST_AREA, SKILLS } from './content';
import type { Command, CombatState, Event, ExpeditionOutcome, GameState, ProgressionState, SkillDefinition, StatusEffect, TargetPolicy } from './types';

const SIMULATION_VERSION = 'v1-expedition-loop';
const TICK_MILLISECONDS = 100;
const HERO_ATTACK_INTERVAL = 1_400;
const ENEMY_ATTACK_INTERVAL = 1_500;
const HERO_MAX_MANA = 30;
const HERO_MANA_REGENERATION = 2;
const HERO_HEALTH_REGENERATION = 1;
const RECOVERY_MILLISECONDS = 3_000;
const MAX_LEVEL = 100;
const XP_PER_LEVEL = 100;
const LEVEL_REWARDS = { attributePoints: 2, skillPoints: 1 };
const STARTER_ACTIVE_SKILLS = ['physical-strike', 'tank-guard', 'general-challenge', 'magic-bolt'];

const emptyProgression = (): ProgressionState => ({
  level: 1,
  experience: 0,
  attributePoints: 0,
  skillPoints: 0,
  attributes: { might: 0, vitality: 0, agility: 0, focus: 0 },
  skillRanks: Object.fromEntries(STARTER_ACTIVE_SKILLS.map((id) => [id, 1])),
  preparation: {
    activeSkillIds: STARTER_ACTIVE_SKILLS,
    auraId: null,
    ultimateId: null,
    targetPolicy: 'first',
    skillTargetPolicies: {},
  },
});

function event(message: string, id: number): Event { return { id, message }; }

function combatFor(enemyAttack = 0, enemyDefense = 0, progression = emptyProgression()): CombatState {
  const focusRank = progression.skillRanks['magic-focus'] ?? 0;
  return {
    pendingMilliseconds: 0,
    heroAttackProgress: 0,
    enemyAttackProgress: 0,
    heroMana: 20,
    maxMana: HERO_MAX_MANA + progression.attributes.focus * 5 + focusRank * 2,
    heroManaRegeneration: HERO_MANA_REGENERATION + progression.attributes.focus * 0.2,
    heroHealthRegeneration: HERO_HEALTH_REGENERATION + progression.attributes.vitality * 0.1,
    heroDefense: 10 + progression.attributes.vitality * 0.5,
    enemyAttack,
    enemyDefense,
    heroCooldowns: {},
    heroStatuses: [],
    enemyStatuses: [],
    targetPolicy: progression.preparation.targetPolicy,
  };
}

function derivedHero(progression: ProgressionState) {
  const passiveRank = (id: string) => progression.skillRanks[id] ?? 0;
  return {
    attack: 8 + progression.attributes.might * 2,
    maxHealth: 100 + progression.attributes.vitality * 10 + passiveRank('tank-fortitude') * 3,
    attackInterval: Math.max(1_000, HERO_ATTACK_INTERVAL * (1 - Math.min(0.5, progression.attributes.agility * 0.005 + passiveRank('general-quickness') * 0.005 + passiveRank('physical-tempo') * 0.003))),
  };
}

function reviewQueue(state: GameState, levelMessages = state.reviewQueue.filter((message) => message.startsWith('Level '))) {
  const pending = state.progression.attributePoints > 0
    ? [`${state.progression.attributePoints} Attribute point${state.progression.attributePoints === 1 ? '' : 's'} available to spend.`]
    : [];
  const skillPending = state.progression.skillPoints > 0
    ? [`${state.progression.skillPoints} Skill point${state.progression.skillPoints === 1 ? '' : 's'} available to spend.`]
    : [];
  return [...levelMessages, ...pending, ...skillPending];
}

export function calculateMitigatedDamage(rawDamage: number, mitigation: number): number {
  if (rawDamage <= 0) return 0;
  return Math.max(1, Math.floor(rawDamage * 100 / (100 + Math.max(0, mitigation))));
}

export function createGame(seed = 1, options: { startingHealth?: number; enemyAttack?: number } = {}): GameState {
  const room = FIRST_AREA.rooms[0];
  const progression = emptyProgression();
  return {
    simulationVersion: SIMULATION_VERSION,
    seed,
    elapsedMilliseconds: 0,
    status: 'preparation',
    areaName: FIRST_AREA.name,
    roomCount: FIRST_AREA.rooms.length,
    roomIndex: 0,
    roomType: room.type,
    hero: { name: 'Ari', health: options.startingHealth ?? 100, ...derivedHero(progression) },
    enemy: room.type === 'combat' ? { name: room.enemy.name, health: room.enemy.health, maxHealth: room.enemy.health } : null,
    committed: { experience: 0, currency: 0 },
    recoveryRemainingMilliseconds: 0,
    autoRepeat: true,
    outcome: null,
    events: [event('A new Hero is ready in Sunlit Meadow.', 0)],
    progression,
    skills: SKILLS,
    reviewQueue: [],
    combat: combatFor(room.type === 'combat' ? options.enemyAttack ?? room.enemy.attack : 0, 0, progression),
  };
}

export function isSkillEligible(progression: ProgressionState, skill: SkillDefinition): boolean {
  return progression.level >= skill.unlockLevel && skill.prerequisites.every((id) => (progression.skillRanks[id] ?? 0) > 0);
}

function skillById(state: GameState, id: string): SkillDefinition | undefined {
  return state.skills.find((skill) => skill.id === id);
}

function selectedSkill(state: GameState): SkillDefinition | undefined {
  const selectedIds = [state.progression.preparation.ultimateId, ...state.progression.preparation.activeSkillIds].filter((id): id is string => id !== null);
  return selectedIds
    .map((id) => skillById(state, id))
    .find((skill) => skill && (state.progression.skillRanks[skill.id] ?? 0) > 0 && (state.combat.heroCooldowns[skill.id] ?? 0) === 0);
}

export function selectTarget<T extends { health: number; name: string }>(targets: T[], policy: TargetPolicy): T | undefined {
  if (targets.length === 0) return undefined;
  if (policy === 'last') return targets.at(-1);
  if (policy === 'lowest-health') return [...targets].sort((a, b) => a.health - b.health)[0];
  if (policy === 'highest-health') return [...targets].sort((a, b) => b.health - a.health)[0];
  return targets[0];
}

function addEvent(state: GameState, message: string): GameState {
  const nextId = (state.events.at(-1)?.id ?? -1) + 1;
  return { ...state, events: [...state.events.slice(-5), event(message, nextId)] };
}

function withCombat(state: GameState, combat: Partial<CombatState>): GameState {
  return { ...state, combat: { ...state.combat, ...combat } };
}

function refreshProgressionPresentation(state: GameState, levelMessages?: string[]): GameState {
  const heroStats = derivedHero(state.progression);
  const aura = state.progression.preparation.auraId ? skillById(state, state.progression.preparation.auraId) : undefined;
  const auraMultiplier = aura?.id === 'general-focus' || aura?.id === 'magic-aura' ? 1.1 : 1;
  const maxHealthDelta = heroStats.maxHealth - state.hero.maxHealth;
  return {
    ...state,
    hero: {
      ...state.hero,
      ...heroStats,
      health: Math.min(heroStats.maxHealth, Math.max(0, state.hero.health + Math.max(0, maxHealthDelta))),
    },
    combat: {
      ...state.combat,
      maxMana: HERO_MAX_MANA + state.progression.attributes.focus * 5 + (state.progression.skillRanks['magic-focus'] ?? 0) * 2,
      heroManaRegeneration: (HERO_MANA_REGENERATION + state.progression.attributes.focus * 0.2) * auraMultiplier,
      heroHealthRegeneration: (HERO_HEALTH_REGENERATION + state.progression.attributes.vitality * 0.1) * auraMultiplier,
      heroDefense: 10 + state.progression.attributes.vitality * 0.5,
      targetPolicy: state.progression.preparation.targetPolicy,
    },
    reviewQueue: reviewQueue(state, levelMessages),
  };
}

function enterRoom(state: GameState, roomIndex: number): GameState {
  const room = FIRST_AREA.rooms[roomIndex];
  if (!room) return { ...state, status: 'completed', roomType: 'complete', enemy: null };
  const enemy = room.type === 'combat' ? { name: room.enemy.name, health: room.enemy.health, maxHealth: room.enemy.health } : null;
  return {
    ...state,
    roomIndex,
    roomType: room.type,
    enemy,
    combat: combatFor(room.type === 'combat' ? room.enemy.attack : 0, room.type === 'combat' ? room.enemy.defense : 0, state.progression),
  };
}

function currentRoomLoss(state: GameState): { experience: number; currency: number } {
  const room = FIRST_AREA.rooms[state.roomIndex];
  return room ? { experience: room.experience, currency: room.currency } : { experience: 0, currency: 0 };
}

function outcome(state: GameState, result: ExpeditionOutcome['result'], recoveryMilliseconds: number, willRestart: boolean): ExpeditionOutcome {
  return {
    result,
    roomReached: Math.min(state.roomIndex + 1, state.roomCount),
    committed: state.committed,
    lost: result === 'completed' ? { experience: 0, currency: 0 } : currentRoomLoss(state),
    recoveryMilliseconds,
    willRestart,
  };
}

function beginRecovery(state: GameState): GameState {
  const next = {
    ...state,
    status: 'recovery' as const,
    recoveryRemainingMilliseconds: RECOVERY_MILLISECONDS,
    outcome: outcome(state, 'defeated', RECOVERY_MILLISECONDS, state.autoRepeat),
    hero: { ...state.hero, health: 0 },
    combat: { ...state.combat, pendingMilliseconds: 0 },
  };
  return addEvent(next, 'Ari was defeated. The incomplete Room and its rewards were lost; Recovery begins.');
}

function commitRoom(state: GameState): GameState {
  const room = FIRST_AREA.rooms[state.roomIndex];
  let next = {
    ...state,
    committed: { experience: state.committed.experience + room.experience, currency: state.committed.currency + room.currency },
  };
  const progression = { ...next.progression, experience: next.progression.experience + room.experience };
  const levelMessages = next.reviewQueue.filter((message) => message.startsWith('Level '));
  while (progression.level < MAX_LEVEL && progression.experience >= progression.level * XP_PER_LEVEL) {
    progression.level += 1;
    progression.attributePoints += LEVEL_REWARDS.attributePoints;
    progression.skillPoints += LEVEL_REWARDS.skillPoints;
    levelMessages.push(`Level ${progression.level} reached: ${LEVEL_REWARDS.attributePoints} Attribute points and ${LEVEL_REWARDS.skillPoints} Skill point available.`);
  }
  next = { ...next, progression };
  return refreshProgressionPresentation(next, levelMessages);
}

function expireStatuses(statuses: StatusEffect[]): StatusEffect[] {
  return statuses.map((status) => ({ ...status, remainingMilliseconds: status.remainingMilliseconds - TICK_MILLISECONDS }))
    .filter((status) => status.remainingMilliseconds > 0);
}

function hasStun(statuses: StatusEffect[]): boolean {
  return statuses.some((status) => status.name === 'stun');
}

function resolveCombatTick(state: GameState): GameState {
  if (state.roomType !== 'combat' || !state.enemy) return state;
  if (state.hero.health <= 0) return beginRecovery(state);
  let next = withCombat(state, {
    heroStatuses: expireStatuses(state.combat.heroStatuses),
    enemyStatuses: expireStatuses(state.combat.enemyStatuses),
    heroAttackProgress: state.combat.heroAttackProgress + TICK_MILLISECONDS,
    enemyAttackProgress: state.combat.enemyAttackProgress + TICK_MILLISECONDS,
    heroCooldowns: Object.fromEntries(Object.entries(state.combat.heroCooldowns)
      .map(([name, remaining]) => [name, Math.max(0, remaining - TICK_MILLISECONDS)])),
  });
  next = { ...next, hero: { ...next.hero, health: Math.min(next.hero.maxHealth, next.hero.health + next.combat.heroHealthRegeneration / 10) } };
  next = withCombat(next, { heroMana: Math.min(next.combat.maxMana, next.combat.heroMana + next.combat.heroManaRegeneration / 10) });

  const heroReady = next.combat.heroAttackProgress >= next.hero.attackInterval && !hasStun(next.combat.heroStatuses);
  const enemyReady = next.combat.enemyAttackProgress >= ENEMY_ATTACK_INTERVAL && !hasStun(next.combat.enemyStatuses);
  if (heroReady && next.enemy) {
    const skill = selectedSkill(next);
    const canUseSkill = skill && next.combat.heroMana >= skill.manaCost;
    const policy = skill ? next.progression.preparation.skillTargetPolicies[skill.id] ?? skill.targetPolicy ?? next.combat.targetPolicy : next.combat.targetPolicy;
    const target = selectTarget([next.enemy], policy);
    if (!target) return next;
    const damage = calculateMitigatedDamage(next.hero.attack * (canUseSkill ? skill.damageMultiplier ?? 1 : 1), next.combat.enemyDefense);
    const enemyName = next.enemy.name;
    next = withCombat({ ...next, enemy: { ...next.enemy, health: next.enemy.health - damage } }, {
      heroAttackProgress: next.combat.heroAttackProgress - next.hero.attackInterval,
      heroMana: canUseSkill ? next.combat.heroMana - skill.manaCost : next.combat.heroMana,
      heroCooldowns: canUseSkill && skill.cooldownMilliseconds > 0 ? { ...next.combat.heroCooldowns, [skill.id]: skill.cooldownMilliseconds } : next.combat.heroCooldowns,
    });
    next = addEvent(next, `${skill && canUseSkill ? skill.name : 'Ari'} attacks ${enemyName} for ${damage} damage.`);
  }
  if (enemyReady && next.enemy && next.enemy.health > 0) {
    const damage = calculateMitigatedDamage(next.combat.enemyAttack, next.combat.heroDefense);
    const enemyName = next.enemy.name;
    next = { ...next, hero: { ...next.hero, health: next.hero.health - damage } };
    next = withCombat(next, { enemyAttackProgress: next.combat.enemyAttackProgress - ENEMY_ATTACK_INTERVAL });
    next = addEvent(next, `${enemyName} attacks Ari for ${damage} damage; mitigation applied.`);
  }
  if (next.hero.health <= 0) {
    return beginRecovery(next);
  }
  return next;
}

function advance(state: GameState, milliseconds: number): GameState {
  if (milliseconds <= 0) return state;
  if (state.status === 'recovery') return advanceRecovery(state, milliseconds);
  if (state.status !== 'active') return state;
  let next = { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds };
  let remaining = milliseconds + next.combat.pendingMilliseconds;
  next = withCombat(next, { pendingMilliseconds: 0 });
  while (remaining >= TICK_MILLISECONDS && next.status === 'active') {
    remaining -= TICK_MILLISECONDS;
    if (next.roomType === 'empty') {
      const room = FIRST_AREA.rooms[next.roomIndex];
      if (room.type !== 'empty') return next;
      if (next.combat.heroAttackProgress + TICK_MILLISECONDS >= room.durationMilliseconds) {
        next = commitRoom(next);
        next = { ...next, hero: { ...next.hero, health: Math.min(next.hero.maxHealth, next.hero.health + room.healthEffect) } };
        next = withCombat(next, { heroMana: Math.min(next.combat.maxMana, next.combat.heroMana + room.manaEffect) });
        next = addEvent(next, 'The empty Room resolves its effect and its rewards are committed.');
        next = enterRoom(next, next.roomIndex + 1);
      } else {
        next = withCombat(next, { heroAttackProgress: next.combat.heroAttackProgress + TICK_MILLISECONDS });
      }
    } else {
      next = resolveCombatTick(next);
      if (next.status === 'active' && next.enemy && next.enemy.health <= 0) {
        const defeatedEnemy = next.enemy.name;
        next = commitRoom(next);
        next = addEvent(next, `${defeatedEnemy} is defeated; Room rewards are committed.`);
        next = enterRoom(next, next.roomIndex + 1);
      }
    }
    if (next.roomType === 'complete') {
      next = { ...next, outcome: outcome(next, 'completed', 0, false) };
      next = addEvent(next, 'Expedition completed. All Rooms are secured.');
      if (next.autoRepeat) next = restartExpedition(next, 'The selected Area automatically restarts from Room 1.');
      else next = { ...next, status: 'preparation' as const };
      break;
    }
  }
  if (next.status === 'active') next = withCombat(next, { pendingMilliseconds: remaining });
  else next = withCombat(next, { pendingMilliseconds: 0 });
  return next;
}

function restartExpedition(state: GameState, message: string): GameState {
  const fresh = enterRoom({
    ...state,
    status: 'active',
    committed: { experience: 0, currency: 0 },
    recoveryRemainingMilliseconds: 0,
    hero: { ...state.hero, health: state.hero.maxHealth },
  }, 0);
  return addEvent(refreshProgressionPresentation(fresh), message);
}

function withPreparation(state: GameState, preparation: ProgressionState['preparation']): GameState {
  return refreshProgressionPresentation({
    ...state,
    progression: { ...state.progression, preparation },
  });
}

function canSelectSkill(state: GameState, skillId: string, kind: SkillDefinition['kind']): SkillDefinition | undefined {
  const skill = skillById(state, skillId);
  return skill && skill.kind === kind && (state.progression.skillRanks[skillId] ?? 0) > 0 && isSkillEligible(state.progression, skill) ? skill : undefined;
}

function advanceRecovery(state: GameState, milliseconds: number): GameState {
  const remaining = Math.max(0, state.recoveryRemainingMilliseconds - milliseconds);
  if (remaining > 0) return { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds, recoveryRemainingMilliseconds: remaining };
  const recovered = { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds, recoveryRemainingMilliseconds: 0 };
  if (state.autoRepeat) return restartExpedition(recovered, 'Recovery complete. The selected Area automatically restarts from Room 1.');
  return addEvent({ ...recovered, status: 'preparation', hero: { ...recovered.hero, health: recovered.hero.maxHealth } }, 'Recovery complete. Automatic repeat is stopped; the Area is ready for Preparation.');
}

export function dispatch(state: GameState, command: Command): GameState {
  if (command.type === 'START_EXPEDITION' && state.status === 'preparation' && state.progression.preparation.activeSkillIds.length === 4) {
    return addEvent(refreshProgressionPresentation({ ...state, status: 'active', autoRepeat: true, outcome: null }), 'Expedition started. Preparation is locked.');
  }
  if (command.type === 'ADVANCE_TIME') return advance(state, command.milliseconds);
  if (command.type === 'WITHDRAW' && state.status === 'active') {
    const next = { ...state, status: 'preparation' as const, autoRepeat: false, outcome: outcome(state, 'withdrawn', 0, false) };
    return addEvent(next, 'Expedition withdrawn. Committed progress is retained; incomplete Room rewards were lost. Preparation is available.');
  }
  if (command.type === 'STOP_AUTO_REPEAT' && (state.status === 'active' || state.status === 'recovery')) {
    return addEvent({ ...state, autoRepeat: false, outcome: state.outcome ? { ...state.outcome, willRestart: false } : state.outcome }, 'Automatic repeat stopped.');
  }
  if (command.type === 'SPEND_ATTRIBUTE' && state.status === 'preparation' && state.progression.attributePoints > 0) {
    const attributes = { ...state.progression.attributes, [command.attribute]: state.progression.attributes[command.attribute] + 1 };
    return refreshProgressionPresentation({
      ...state,
      progression: { ...state.progression, attributes, attributePoints: state.progression.attributePoints - 1 },
    });
  }
  if (command.type === 'INVEST_SKILL' && state.status === 'preparation' && state.progression.skillPoints > 0) {
    const skill = skillById(state, command.skillId);
    const currentRank = state.progression.skillRanks[command.skillId] ?? 0;
    if (!skill || !isSkillEligible(state.progression, skill) || currentRank >= skill.maxRank) return state;
    return refreshProgressionPresentation({
      ...state,
      progression: {
        ...state.progression,
        skillPoints: state.progression.skillPoints - 1,
        skillRanks: { ...state.progression.skillRanks, [command.skillId]: currentRank + 1 },
      },
    });
  }
  if (command.type === 'RESPEC_SKILLS' && state.status === 'preparation') {
    const spent = Object.entries(state.progression.skillRanks)
      .filter(([id]) => !STARTER_ACTIVE_SKILLS.includes(id))
      .reduce((total, [, rank]) => total + rank, 0)
      + STARTER_ACTIVE_SKILLS.reduce((total, id) => total + Math.max(0, (state.progression.skillRanks[id] ?? 0) - 1), 0);
    return refreshProgressionPresentation({
      ...state,
      progression: {
        ...state.progression,
        skillPoints: state.progression.skillPoints + spent,
        skillRanks: Object.fromEntries(STARTER_ACTIVE_SKILLS.map((id) => [id, 1])),
        preparation: { ...state.progression.preparation, activeSkillIds: STARTER_ACTIVE_SKILLS, auraId: null, ultimateId: null },
      },
    });
  }
  if (command.type === 'TOGGLE_ACTIVE_SKILL' && state.status === 'preparation') {
    const skill = canSelectSkill(state, command.skillId, 'active');
    if (!skill) return state;
    const selected = state.progression.preparation.activeSkillIds;
    const activeSkillIds = selected.includes(skill.id)
      ? selected.filter((id) => id !== skill.id)
      : selected.length < 4 ? [...selected, skill.id] : selected;
    return withPreparation(state, { ...state.progression.preparation, activeSkillIds });
  }
  if (command.type === 'SELECT_AURA' && state.status === 'preparation') {
    if (command.skillId === null) return withPreparation(state, { ...state.progression.preparation, auraId: null });
    const skill = canSelectSkill(state, command.skillId, 'aura');
    return skill ? withPreparation(state, { ...state.progression.preparation, auraId: skill.id }) : state;
  }
  if (command.type === 'SELECT_ULTIMATE' && state.status === 'preparation') {
    if (command.skillId === null) return withPreparation(state, { ...state.progression.preparation, ultimateId: null });
    const skill = canSelectSkill(state, command.skillId, 'ultimate');
    return skill ? withPreparation(state, { ...state.progression.preparation, ultimateId: skill.id }) : state;
  }
  if (command.type === 'SET_TARGET_POLICY' && state.status === 'preparation') {
    return withPreparation(state, { ...state.progression.preparation, targetPolicy: command.policy });
  }
  if (command.type === 'SET_SKILL_TARGET_POLICY' && state.status === 'preparation') {
    const skill = skillById(state, command.skillId);
    if (!skill || !state.progression.preparation.activeSkillIds.includes(skill.id)) return state;
    return withPreparation(state, { ...state.progression.preparation, skillTargetPolicies: { ...state.progression.preparation.skillTargetPolicies, [skill.id]: command.policy } });
  }
  return state;
}
