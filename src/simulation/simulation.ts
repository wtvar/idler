import { FIRST_AREA } from './content';
import type { Command, CombatState, Event, ExpeditionOutcome, GameState, ProgressionState, StatusEffect } from './types';

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

const emptyProgression = (): ProgressionState => ({
  level: 1,
  experience: 0,
  attributePoints: 0,
  skillPoints: 0,
  attributes: { might: 0, vitality: 0, agility: 0, focus: 0 },
});

function event(message: string, id: number): Event { return { id, message }; }

function combatFor(enemyAttack = 0, enemyDefense = 0, progression = emptyProgression()): CombatState {
  return {
    pendingMilliseconds: 0,
    heroAttackProgress: 0,
    enemyAttackProgress: 0,
    heroMana: 20,
    maxMana: HERO_MAX_MANA + progression.attributes.focus * 5,
    heroManaRegeneration: HERO_MANA_REGENERATION + progression.attributes.focus * 0.2,
    heroHealthRegeneration: HERO_HEALTH_REGENERATION + progression.attributes.vitality * 0.1,
    heroDefense: 10 + progression.attributes.vitality * 0.5,
    enemyAttack,
    enemyDefense,
    heroCooldowns: {},
    heroStatuses: [],
    enemyStatuses: [],
    targetPolicy: 'first',
  };
}

function derivedHero(progression: ProgressionState) {
  return {
    attack: 8 + progression.attributes.might * 2,
    maxHealth: 100 + progression.attributes.vitality * 10,
    attackInterval: Math.max(1_000, HERO_ATTACK_INTERVAL * (1 - Math.min(0.5, progression.attributes.agility * 0.005))),
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
    reviewQueue: [],
    combat: combatFor(room.type === 'combat' ? options.enemyAttack ?? room.enemy.attack : 0, 0, progression),
  };
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
      maxMana: HERO_MAX_MANA + state.progression.attributes.focus * 5,
      heroManaRegeneration: HERO_MANA_REGENERATION + state.progression.attributes.focus * 0.2,
      heroHealthRegeneration: HERO_HEALTH_REGENERATION + state.progression.attributes.vitality * 0.1,
      heroDefense: 10 + state.progression.attributes.vitality * 0.5,
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
    const damage = calculateMitigatedDamage(next.hero.attack, next.combat.enemyDefense);
    const enemyName = next.enemy.name;
    next = withCombat({ ...next, enemy: { ...next.enemy, health: next.enemy.health - damage } }, { heroAttackProgress: next.combat.heroAttackProgress - next.hero.attackInterval });
    next = addEvent(next, `Ari attacks ${enemyName} for ${damage} damage.`);
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

function advanceRecovery(state: GameState, milliseconds: number): GameState {
  const remaining = Math.max(0, state.recoveryRemainingMilliseconds - milliseconds);
  if (remaining > 0) return { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds, recoveryRemainingMilliseconds: remaining };
  const recovered = { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds, recoveryRemainingMilliseconds: 0 };
  if (state.autoRepeat) return restartExpedition(recovered, 'Recovery complete. The selected Area automatically restarts from Room 1.');
  return addEvent({ ...recovered, status: 'preparation', hero: { ...recovered.hero, health: recovered.hero.maxHealth } }, 'Recovery complete. Automatic repeat is stopped; the Area is ready for Preparation.');
}

export function dispatch(state: GameState, command: Command): GameState {
  if (command.type === 'START_EXPEDITION' && state.status === 'preparation') {
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
  return state;
}
