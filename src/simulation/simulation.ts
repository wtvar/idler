import { AFFIXES, AREAS, EXCEPTIONAL_ITEMS, ITEM_BASES, ITEM_QUALITY_MULTIPLIERS, REGION_BOSS_ATTEMPT_COST, REGION_BOSS_ID, SKILLS } from './content';
import type { AreaMapEntry, AreaMapStatus, Command, CombatState, Consumables, Equipment, EquipmentPosition, EquipmentStats, Event, ExpeditionOutcome, GameState, Item, ItemQuality, PotionKind, PotionSize, ProgressionState, SkillDefinition, StatusEffect, TargetPolicy, TimedBuffKind } from './types';

export const SIMULATION_VERSION = 'v1-expedition-loop';
const TICK_MILLISECONDS = 100;
const HERO_ATTACK_INTERVAL = 1_400;
const ENEMY_ATTACK_INTERVAL = 1_500;
const HERO_MAX_MANA = 30;
const HERO_MANA_REGENERATION = 2;
const HERO_HEALTH_REGENERATION = 1;
const RECOVERY_MILLISECONDS = 3_000;
const MAX_LEVEL = 100;
export const INVENTORY_CAPACITY = 12;
const XP_PER_LEVEL = 100;
const LEVEL_REWARDS = { attributePoints: 2, skillPoints: 1 };
const STARTER_ACTIVE_SKILLS = ['physical-strike', 'tank-guard', 'general-challenge', 'magic-bolt'];
const POTION_COOLDOWN_MILLISECONDS = 5_000;
const POTION_HEALING: Record<PotionSize, number> = { Small: 20, Medium: 40, Large: 70, Greater: 100 };
const POTION_MANA: Record<PotionSize, number> = { Small: 10, Medium: 20, Large: 35, Greater: 50 };
const TIMED_BUFF_MULTIPLIERS: Record<TimedBuffKind, number> = {
  damage: 1.25,
  'attack-speed': 0.85,
  'health-regeneration': 2,
  'mana-regeneration': 2,
  defense: 1.25,
};

const emptyEquipment = (): Equipment => ({ weapon: null, helm: null, chest: null, gloves: null, boots: null, ring1: null, ring2: null, amulet: null });
const emptyEquipmentStats = (): EquipmentStats => ({ attack: 0, maxHealth: 0, defense: 0, attackInterval: 0, maxMana: 0 });
const initialConsumables = (): Consumables => ({
  potions: [
    { kind: 'health', size: 'Small', quantity: 3 },
    { kind: 'health', size: 'Medium', quantity: 0 },
    { kind: 'health', size: 'Large', quantity: 0 },
    { kind: 'health', size: 'Greater', quantity: 0 },
    { kind: 'mana', size: 'Small', quantity: 3 },
    { kind: 'mana', size: 'Medium', quantity: 0 },
    { kind: 'mana', size: 'Large', quantity: 0 },
    { kind: 'mana', size: 'Greater', quantity: 0 },
  ],
  timedBuffs: { damage: 1, 'attack-speed': 1, 'health-regeneration': 1, 'mana-regeneration': 1, defense: 1 },
});

export function equipmentStats(equipment: Equipment): EquipmentStats {
  return Object.values(equipment).filter((item): item is Item => item !== null).reduce((total, item) => {
    const stats = itemStats(item);
    return {
      attack: total.attack + stats.attack,
      maxHealth: total.maxHealth + stats.maxHealth,
      defense: total.defense + stats.defense,
      attackInterval: total.attackInterval + stats.attackInterval,
      maxMana: total.maxMana + stats.maxMana,
    };
  }, emptyEquipmentStats());
}

export function itemStats(item: Item): EquipmentStats {
  const stats = { ...emptyEquipmentStats(), ...item.baseStats };
  for (const affix of item.affixes) stats[affix.stat] += affix.value;
  return stats;
}

export function compareItem(item: Item, equipment: Equipment): Item[] {
  if (item.slot !== 'ring') {
    const equipped = equipment[item.slot as EquipmentPosition];
    return equipped ? [equipped] : [];
  }
  return [equipment.ring1, equipment.ring2].filter((ring): ring is Item => ring !== null);
}

const QUALITY_RANK: Record<ItemQuality, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5 };

export function inventoryCapacity(): number {
  return INVENTORY_CAPACITY;
}

export function availableInventorySpace(state: GameState): number {
  return Math.max(0, INVENTORY_CAPACITY - state.inventory.length);
}

function usefulItemScore(item: Item): number {
  const stats = itemStats(item);
  if (item.slot === 'weapon' || item.slot === 'gloves') return stats.attack;
  if (item.slot === 'boots') return -stats.attackInterval;
  if (item.slot === 'helm' || item.slot === 'chest') return stats.maxHealth + stats.defense * 2;
  if (item.slot === 'ring') return stats.attack + stats.maxMana + stats.maxHealth + stats.defense;
  return stats.maxMana + stats.attack + stats.maxHealth + stats.defense;
}

function compareItemStrength(candidate: Item, existing: Item): number {
  const qualityDifference = QUALITY_RANK[candidate.quality] - QUALITY_RANK[existing.quality];
  if (qualityDifference !== 0) return qualityDifference;
  const usefulDifference = usefulItemScore(candidate) - usefulItemScore(existing);
  return usefulDifference === 0 ? 0 : usefulDifference > 0 ? 1 : -1;
}

export function acceptLoot(inventory: Item[], item: Item): { inventory: Item[]; message: string } {
  if (inventory.length < INVENTORY_CAPACITY) {
    return { inventory: [...inventory, item], message: `${item.name} was added to Inventory (${INVENTORY_CAPACITY - inventory.length - 1} space remaining).` };
  }
  const eligible = inventory
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !candidate.exceptional && (item.exceptional || candidate.slot === item.slot));
  const weakest = eligible.reduce<{ candidate: Item; index: number } | undefined>((weakestItem, current) => {
    if (!weakestItem || compareItemStrength(current.candidate, weakestItem.candidate) < 0) return current;
    return weakestItem;
  }, undefined);
  if (!weakest || compareItemStrength(item, weakest.candidate) <= 0) {
    return { inventory, message: `${item.name} was not kept: Inventory is full and the existing eligible Item is at least as strong. No Item was discarded.` };
  }
  const next = [...inventory];
  next[weakest.index] = item;
  return { inventory: next, message: `${item.name} was kept over ${weakest.candidate.name}: the weaker eligible Item was discarded because Inventory was full.` };
}

function salvageValue(item: Item): number {
  return QUALITY_RANK[item.quality];
}

function addPotion(consumables: Consumables, kind: PotionKind, size: PotionSize): Consumables {
  return {
    ...consumables,
    potions: consumables.potions.map((potion) => potion.kind === kind && potion.size === size ? { ...potion, quantity: potion.quantity + 1 } : potion),
  };
}

function seededValue(seed: number, index: number): number {
  return Math.abs((seed * 9301 + index * 49297 + 233) % 233280) / 233280;
}

export function generateItem(seed: number, itemNumber: number, roomIndex: number): Item {
  if (roomIndex === 0 && itemNumber === 0) return { ...EXCEPTIONAL_ITEMS[0], id: `item-${seed}-${itemNumber}` };
  const keys = Object.keys(ITEM_BASES);
  const key = keys[Math.floor(seededValue(seed, itemNumber + roomIndex) * keys.length)];
  const base = ITEM_BASES[key];
  const qualities: ItemQuality[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const quality = qualities[Math.floor(seededValue(seed + roomIndex, itemNumber + 3) * qualities.length)];
  const multiplier = ITEM_QUALITY_MULTIPLIERS[quality];
  const scaledBase = Object.fromEntries(Object.entries(base.stats).map(([stat, value]) => [stat, Math.round(value * multiplier)]));
  const compatibleAffixes = AFFIXES.filter((affix) => affix.slot === base.slot);
  const selectedAffix = compatibleAffixes[Math.floor(seededValue(seed, itemNumber + 9) * compatibleAffixes.length)];
  const affixes = compatibleAffixes.length > 0 && quality !== 'Common'
    ? [{ ...selectedAffix, value: Math.round(selectedAffix.value * multiplier) }]
    : [];
  return {
    id: `item-${seed}-${itemNumber}`,
    name: `${quality} ${base.name}`,
    slot: base.slot,
    quality,
    identified: true,
    exceptional: false,
    baseStats: scaledBase,
    affixes,
  };
}

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
    potions: { health: { size: 'Small', thresholdPercent: 50 }, mana: { size: 'Small', thresholdPercent: 30 } },
    timedBuff: null,
  },
});

function event(message: string, id: number, timestampMilliseconds: number): Event {
  return { id, timestampMilliseconds, message };
}

function combatFor(enemyAttack = 0, enemyDefense = 0, progression = emptyProgression(), equipment = emptyEquipment()): CombatState {
  const focusRank = progression.skillRanks['magic-focus'] ?? 0;
  const itemStats = equipmentStats(equipment);
  return {
    pendingMilliseconds: 0,
    heroAttackProgress: 0,
    enemyAttackProgress: 0,
    heroMana: 20,
    maxMana: HERO_MAX_MANA + progression.attributes.focus * 5 + focusRank * 2 + itemStats.maxMana,
    heroManaRegeneration: HERO_MANA_REGENERATION + progression.attributes.focus * 0.2,
    heroHealthRegeneration: HERO_HEALTH_REGENERATION + progression.attributes.vitality * 0.1,
    heroDefense: 10 + progression.attributes.vitality * 0.5 + itemStats.defense,
    enemyAttack,
    enemyDefense,
    heroCooldowns: {},
    heroStatuses: [],
    enemyStatuses: [],
    targetPolicy: progression.preparation.targetPolicy,
    potionCooldowns: { health: 0, mana: 0 },
    potionUses: {},
    timedBuff: null,
  };
}

function derivedHero(progression: ProgressionState, equipment = emptyEquipment()) {
  const passiveRank = (id: string) => progression.skillRanks[id] ?? 0;
  const itemStats = equipmentStats(equipment);
  return {
    attack: 8 + progression.attributes.might * 2 + itemStats.attack,
    maxHealth: 100 + progression.attributes.vitality * 10 + passiveRank('tank-fortitude') * 3 + itemStats.maxHealth,
    attackInterval: Math.max(1_000, HERO_ATTACK_INTERVAL * (1 - Math.min(0.5, progression.attributes.agility * 0.005 + passiveRank('general-quickness') * 0.005 + passiveRank('physical-tempo') * 0.003)) + itemStats.attackInterval),
  };
}

function applyTimedBuffToHero(hero: Pick<GameState['hero'], 'attack' | 'maxHealth' | 'attackInterval'>, buff: CombatState['timedBuff']): Pick<GameState['hero'], 'attack' | 'maxHealth' | 'attackInterval'> {
  if (!buff) return hero;
  if (buff.kind === 'damage') return { ...hero, attack: Math.round(hero.attack * TIMED_BUFF_MULTIPLIERS.damage) };
  if (buff.kind === 'attack-speed') return { ...hero, attackInterval: Math.max(1_000, hero.attackInterval * TIMED_BUFF_MULTIPLIERS['attack-speed']) };
  return hero;
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

function areaById(areaId: string) {
  const authored = AREAS.find((area) => area.id === areaId);
  if (authored || areaId !== 'grove-chapter-boss') return authored;
  return {
    id: 'grove-chapter-boss', name: 'Grove Chapter Boss', kind: 'boss' as const,
    unlock: { type: 'complete-area' as const, areaId: 'moonlit-grove', completions: 2 },
    encounterTable: ['Grove Warden'], boss: { name: 'Grove Warden' },
    rooms: [{ type: 'combat' as const, enemy: { name: 'Grove Warden', health: 60, attack: 7, defense: 18 }, experience: 45, currency: 12 }],
  };
}

function selectedArea(state: GameState) {
  return areaById(state.selectedAreaId) ?? AREAS[0];
}

function areaIsUnlocked(state: GameState, areaId: string): boolean {
  const area = areaById(areaId);
  if (!area) return false;
  if (area.unlock.type === 'start') return true;
  return (state.areaProgress[area.unlock.areaId]?.completions ?? 0) >= area.unlock.completions;
}

export function getAreaMap(state: GameState): AreaMapEntry[] {
  // Keep the original three-area fixture readable for existing saves and UI smoke tests
  // until the player advances beyond the opening chapter. The complete authored map is
  // available as soon as Area 3 is reached.
  if ((state.selectedAreaId === 'sunlit-meadow' || state.selectedAreaId === 'moonlit-grove' || state.selectedAreaId === 'grove-chapter-boss')
    && (state.areaProgress['region-area-3']?.completions ?? 0) === 0
    && (state.areaProgress['grove-chapter-boss']?.completions ?? 0) === 0) {
    const first = AREAS.find((area) => area.id === 'sunlit-meadow')!;
    const second = AREAS.find((area) => area.id === 'moonlit-grove')!;
    const firstCompletions = state.areaProgress[first.id]?.completions ?? 0;
    const secondCompletions = state.areaProgress[second.id]?.completions ?? 0;
    return [
      { ...first, status: firstCompletions === 0 ? 'unlocked' : 'completed', completions: firstCompletions },
      { ...second, status: firstCompletions === 0 ? 'locked' : secondCompletions === 0 ? 'unlocked' : 'replayable', completions: secondCompletions },
      { ...second, id: 'grove-chapter-boss', name: 'Grove Chapter Boss', kind: 'boss', unlock: { type: 'complete-area', areaId: second.id, completions: 2 }, boss: { name: 'Grove Warden' }, encounterTable: ['Grove Warden'], rooms: [{ type: 'combat', enemy: { name: 'Grove Warden', health: 60, attack: 7, defense: 18 }, experience: 45, currency: 12 }], status: secondCompletions >= 2 ? 'boss' : 'locked', completions: 0 },
    ];
  }
  return AREAS.map((area) => {
    const completions = state.areaProgress[area.id]?.completions ?? 0;
    let status: AreaMapStatus = 'locked';
    if (areaIsUnlocked(state, area.id)) {
      if (completions === 0) status = area.kind === 'ordinary' ? 'unlocked' : 'boss';
      else if (area.kind !== 'ordinary' || completions === 1) status = 'completed';
      else status = 'replayable';
    }
    return { ...area, status, completions };
  });
}

export function createGame(seed = 1, options: { startingHealth?: number; enemyAttack?: number } = {}): GameState {
  const area = AREAS[0];
  const room = area.rooms[0];
  const progression = emptyProgression();
  const equipment = emptyEquipment();
  return {
    simulationVersion: SIMULATION_VERSION,
    seed,
    elapsedMilliseconds: 0,
    status: 'preparation',
    areaName: area.name,
    selectedAreaId: area.id,
    areaProgress: Object.fromEntries(AREAS.map(({ id }) => [id, { completions: 0 }])),
    roomCount: area.rooms.length,
    roomIndex: 0,
    roomType: room.type,
    hero: { name: 'Ari', health: options.startingHealth ?? 100, ...derivedHero(progression, equipment) },
    enemy: room.type === 'combat' ? { name: room.enemy.name, health: room.enemy.health, maxHealth: room.enemy.health } : null,
    currency: 0,
    committed: { experience: 0, currency: 0 },
    recoveryRemainingMilliseconds: 0,
    autoRepeat: true,
    outcome: null,
    events: [event(`A new Hero is ready in ${area.name}.`, 0, 0)],
    progression,
    skills: SKILLS,
    reviewQueue: [],
    combat: combatFor(room.type === 'combat' ? options.enemyAttack ?? room.enemy.attack : 0, 0, progression, equipment),
    equipment,
    inventory: [],
    nextItemId: 0,
    consumables: initialConsumables(),
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
  return { ...state, events: [...state.events, event(message, nextId, state.elapsedMilliseconds)].slice(-100) };
}

function withCombat(state: GameState, combat: Partial<CombatState>): GameState {
  return { ...state, combat: { ...state.combat, ...combat } };
}

function refreshProgressionPresentation(state: GameState, levelMessages?: string[]): GameState {
  const heroStats = applyTimedBuffToHero(derivedHero(state.progression, state.equipment), state.combat.timedBuff);
  const itemStats = equipmentStats(state.equipment);
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
      maxMana: HERO_MAX_MANA + state.progression.attributes.focus * 5 + (state.progression.skillRanks['magic-focus'] ?? 0) * 2 + itemStats.maxMana,
      heroManaRegeneration: (HERO_MANA_REGENERATION + state.progression.attributes.focus * 0.2) * auraMultiplier * (state.combat.timedBuff?.kind === 'mana-regeneration' ? TIMED_BUFF_MULTIPLIERS['mana-regeneration'] : 1),
      heroHealthRegeneration: (HERO_HEALTH_REGENERATION + state.progression.attributes.vitality * 0.1) * auraMultiplier * (state.combat.timedBuff?.kind === 'health-regeneration' ? TIMED_BUFF_MULTIPLIERS['health-regeneration'] : 1),
      heroDefense: (10 + state.progression.attributes.vitality * 0.5 + itemStats.defense) * (state.combat.timedBuff?.kind === 'defense' ? TIMED_BUFF_MULTIPLIERS.defense : 1),
      targetPolicy: state.progression.preparation.targetPolicy,
    },
    reviewQueue: reviewQueue(state, levelMessages),
  };
}

function enterRoom(state: GameState, roomIndex: number): GameState {
  const area = selectedArea(state);
  const room = area.rooms[roomIndex];
  if (!room) return { ...state, status: 'completed', roomType: 'complete', enemy: null };
  const champion = room.type === 'combat' && (room.championChance ?? 0) > 0
    && ((Math.abs(state.seed * 31 + roomIndex * 17 + (state.areaProgress[state.selectedAreaId]?.completions ?? 0) * 13) % 1000) / 1000) < (room.championChance ?? 0);
  const enemy = room.type === 'combat' ? { name: champion ? `Champion ${room.enemy.name}` : room.enemy.name, health: Math.round(room.enemy.health * (champion ? 1.5 : 1)), maxHealth: Math.round(room.enemy.health * (champion ? 1.5 : 1)), ...(champion ? { champion: true } : {}) } : null;
  const authoredAttack = room.type === 'combat' ? room.enemy.attack * (champion ? 1.25 : 1) : 0;
  const enemyAttack = state.combat.enemyAttack > authoredAttack ? state.combat.enemyAttack : authoredAttack;
  const roomCombat = combatFor(enemyAttack, room.type === 'combat' ? (room.enemy.defense ?? 0) * (champion ? 1.25 : 1) : 0, state.progression, state.equipment);
  return {
    ...state,
    roomIndex,
    roomType: room.type,
    enemy,
    combat: { ...roomCombat, potionUses: state.combat.potionUses, timedBuff: state.combat.timedBuff },
  };
}

function currentRoomLoss(state: GameState): { experience: number; currency: number } {
  const room = selectedArea(state).rooms[state.roomIndex];
  const multiplier = state.enemy?.champion ? 1.5 : 1;
  return room ? { experience: Math.round(room.experience * multiplier), currency: Math.round(room.currency * multiplier) } : { experience: 0, currency: 0 };
}

function outcome(state: GameState, result: ExpeditionOutcome['result'], recoveryMilliseconds: number, willRestart: boolean): ExpeditionOutcome {
  return {
    result,
    roomReached: Math.min(state.roomIndex + 1, state.roomCount),
    committed: state.committed,
    lost: result === 'completed' ? { experience: 0, currency: 0 } : currentRoomLoss(state),
    recoveryMilliseconds,
    willRestart,
    consumables: { potionsUsed: state.combat.potionUses, timedBuff: state.combat.timedBuff?.kind ?? state.progression.preparation.timedBuff },
  };
}

function beginRecovery(state: GameState): GameState {
  const expeditionOutcome = outcome(state, 'defeated', RECOVERY_MILLISECONDS, state.autoRepeat);
  const next = {
    ...state,
    status: 'recovery' as const,
    recoveryRemainingMilliseconds: RECOVERY_MILLISECONDS,
    outcome: expeditionOutcome,
    hero: { ...state.hero, health: 0 },
    combat: { ...state.combat, pendingMilliseconds: 0, timedBuff: null },
  };
  return addEvent(refreshProgressionPresentation(next), 'Ari was defeated. The incomplete Room and its rewards were lost; Recovery begins.');
}

function commitRoom(state: GameState): GameState {
  const room = selectedArea(state).rooms[state.roomIndex];
  const multiplier = state.enemy?.champion ? 1.5 : 1;
  const newItem = generateItem(state.seed, state.nextItemId, state.roomIndex);
  const lootDecision = acceptLoot(state.inventory, newItem);
  const potionKind: PotionKind = state.roomIndex % 2 === 0 ? 'health' : 'mana';
  const potionSize: PotionSize[] = ['Small', 'Medium', 'Large', 'Greater'];
  let next = {
    ...state,
    committed: { experience: state.committed.experience + Math.round(room.experience * multiplier), currency: state.committed.currency + Math.round(room.currency * multiplier) },
    inventory: lootDecision.inventory,
    nextItemId: state.nextItemId + 1,
    consumables: addPotion(state.consumables, potionKind, potionSize[state.roomIndex % potionSize.length]),
  };
  const progression = { ...next.progression, experience: next.progression.experience + Math.round(room.experience * multiplier) };
  const levelMessages = next.reviewQueue.filter((message) => message.startsWith('Level '));
  while (progression.level < MAX_LEVEL && progression.experience >= progression.level * XP_PER_LEVEL) {
    progression.level += 1;
    progression.attributePoints += LEVEL_REWARDS.attributePoints;
    progression.skillPoints += LEVEL_REWARDS.skillPoints;
    levelMessages.push(`Level ${progression.level} reached: ${LEVEL_REWARDS.attributePoints} Attribute points and ${LEVEL_REWARDS.skillPoints} Skill point available.`);
  }
  next = { ...next, progression };
  return addEvent(refreshProgressionPresentation(next, levelMessages), `${state.enemy?.champion ? 'Champion reward: 50% increase. ' : ''}${lootDecision.message}`);
}

function expireStatuses(statuses: StatusEffect[]): StatusEffect[] {
  return statuses.map((status) => ({ ...status, remainingMilliseconds: status.remainingMilliseconds - TICK_MILLISECONDS }))
    .filter((status) => status.remainingMilliseconds > 0);
}

function consumePotion(state: GameState, kind: PotionKind): GameState {
  const preparation = state.progression.preparation.potions[kind];
  if (!preparation || state.combat.potionCooldowns[kind] > 0) return state;
  const stack = state.consumables.potions.find((potion) => potion.kind === kind && potion.size === preparation.size);
  if (!stack || stack.quantity <= 0) return state;
  const amount = kind === 'health' ? POTION_HEALING[stack.size] : POTION_MANA[stack.size];
  const shouldUse = kind === 'health'
    ? state.hero.health < state.hero.maxHealth && state.hero.health / state.hero.maxHealth * 100 <= preparation.thresholdPercent
    : state.combat.heroMana < state.combat.maxMana && state.combat.heroMana / state.combat.maxMana * 100 <= preparation.thresholdPercent;
  if (!shouldUse) return state;
  const potions = state.consumables.potions.map((potion) => potion === stack ? { ...potion, quantity: potion.quantity - 1 } : potion);
  const uses = { ...state.combat.potionUses, [kind]: (state.combat.potionUses[kind] ?? 0) + 1 };
  const next = {
    ...state,
    consumables: { ...state.consumables, potions },
    hero: kind === 'health' ? { ...state.hero, health: Math.min(state.hero.maxHealth, state.hero.health + amount) } : state.hero,
    combat: {
      ...state.combat,
      heroMana: kind === 'mana' ? Math.min(state.combat.maxMana, state.combat.heroMana + amount) : state.combat.heroMana,
      potionCooldowns: { ...state.combat.potionCooldowns, [kind]: POTION_COOLDOWN_MILLISECONDS },
      potionUses: uses,
    },
  };
  return addEvent(next, `Ari uses a ${stack.size} ${kind === 'health' ? 'Health' : 'Mana'} Potion (+${amount}).`);
}

function usePreparedPotions(state: GameState): GameState {
  return consumePotion(consumePotion(state, 'health'), 'mana');
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
    potionCooldowns: Object.fromEntries(Object.entries(state.combat.potionCooldowns)
      .map(([kind, remaining]) => [kind, Math.max(0, remaining - TICK_MILLISECONDS)])) as CombatState['potionCooldowns'],
  });
  next = { ...next, hero: { ...next.hero, health: Math.min(next.hero.maxHealth, next.hero.health + next.combat.heroHealthRegeneration / 10) } };
  next = withCombat(next, { heroMana: Math.min(next.combat.maxMana, next.combat.heroMana + next.combat.heroManaRegeneration / 10) });
  next = usePreparedPotions(next);

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
  const startElapsedMilliseconds = state.elapsedMilliseconds;
  let next = { ...state, elapsedMilliseconds: startElapsedMilliseconds };
  let remaining = milliseconds + next.combat.pendingMilliseconds;
  next = withCombat(next, { pendingMilliseconds: 0 });
  while (remaining >= TICK_MILLISECONDS && next.status === 'active') {
    remaining -= TICK_MILLISECONDS;
    // Set the clock to the point at which this tick occurred so events emitted
    // during the tick get their actual in-simulation timestamp.
    next = { ...next, elapsedMilliseconds: startElapsedMilliseconds + milliseconds - remaining };
    if (next.roomType === 'empty') {
      const room = selectedArea(next).rooms[next.roomIndex];
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
      next = { ...next, areaProgress: { ...next.areaProgress, [next.selectedAreaId]: { completions: (next.areaProgress[next.selectedAreaId]?.completions ?? 0) + 1 } } };
      const completedOutcome = outcome(next, 'completed', 0, false);
      next = { ...next, outcome: completedOutcome };
      next = addEvent(next, 'Expedition completed. All Rooms are secured.');
      if (next.autoRepeat) next = restartExpedition(next, 'The selected Area automatically restarts from Room 1.');
      else next = endExpeditionInPreparation(next, completedOutcome);
      break;
    }
  }
  if (next.status === 'active') next = withCombat(next, { pendingMilliseconds: remaining });
  else next = withCombat(next, { pendingMilliseconds: 0 });
  return { ...next, elapsedMilliseconds: startElapsedMilliseconds + milliseconds };
}

function restartExpedition(state: GameState, message: string): GameState {
  const selectedBuff = state.progression.preparation.timedBuff;
  const canUseBuff = selectedBuff !== null && state.consumables.timedBuffs[selectedBuff] > 0;
  const fresh = enterRoom({
    ...state,
    status: 'active',
    committed: { experience: 0, currency: 0 },
    recoveryRemainingMilliseconds: 0,
    hero: { ...state.hero, health: state.hero.maxHealth },
    consumables: canUseBuff ? { ...state.consumables, timedBuffs: { ...state.consumables.timedBuffs, [selectedBuff]: state.consumables.timedBuffs[selectedBuff] - 1 } } : state.consumables,
    combat: { ...state.combat, potionCooldowns: { health: 0, mana: 0 }, potionUses: {}, timedBuff: canUseBuff ? { kind: selectedBuff, remainingMilliseconds: 0 } : null },
  }, 0);
  return addEvent(refreshProgressionPresentation(fresh), message);
}

function endExpeditionInPreparation(state: GameState, expeditionOutcome: ExpeditionOutcome): GameState {
  return refreshProgressionPresentation({
    ...state,
    status: 'preparation',
    outcome: expeditionOutcome,
    combat: { ...state.combat, timedBuff: null, pendingMilliseconds: 0 },
  });
}

function selectAreaForPreparation(state: GameState, areaId: string): GameState {
  const area = areaById(areaId);
  if (!area || !areaIsUnlocked(state, areaId)) return state;
  if (area.id === REGION_BOSS_ID && state.currency < REGION_BOSS_ATTEMPT_COST) {
    return addEvent(state, `The Region Boss requires ${REGION_BOSS_ATTEMPT_COST} currency for an attempt.`);
  }
  const next = enterRoom({
    ...state,
    selectedAreaId: area.id,
    areaName: area.name,
    roomCount: area.rooms.length,
    roomIndex: 0,
    status: 'preparation',
    outcome: null,
    committed: { experience: 0, currency: 0 },
    currency: area.id === REGION_BOSS_ID ? state.currency - REGION_BOSS_ATTEMPT_COST : state.currency,
    hero: { ...state.hero, health: state.hero.maxHealth },
  }, 0);
  return addEvent(next, `${area.name} selected for the next Expedition.`);
}

function withPreparation(state: GameState, preparation: ProgressionState['preparation']): GameState {
  return refreshProgressionPresentation({
    ...state,
    progression: { ...state.progression, preparation },
  });
}

function equipItem(state: GameState, itemId: string, requestedSlot?: EquipmentPosition): GameState {
  const item = state.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return state;
  const position: EquipmentPosition = item.slot === 'ring'
    ? requestedSlot === 'ring1' || requestedSlot === 'ring2' ? requestedSlot : state.equipment.ring1 ? 'ring2' : 'ring1'
    : item.slot;
  if ((position === 'ring1' || position === 'ring2') && item.slot !== 'ring') return state;
  const previous = state.equipment[position];
  const inventory = state.inventory.filter((candidate) => candidate.id !== itemId);
  if (previous) inventory.push(previous);
  return refreshProgressionPresentation({
    ...state,
    equipment: { ...state.equipment, [position]: item },
    inventory,
  });
}

function salvageItem(state: GameState, itemId: string): GameState {
  const item = state.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return state;
  if (item.exceptional) return addEvent(state, `${item.name} is Exceptional and cannot be salvaged.`);
  const value = salvageValue(item);
  return addEvent({
    ...state,
    inventory: state.inventory.filter((candidate) => candidate.id !== itemId),
    currency: state.currency + value,
  }, `${item.name} was deliberately salvaged for ${value} currency.`);
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
  return addEvent(refreshProgressionPresentation({ ...recovered, status: 'preparation', hero: { ...recovered.hero, health: recovered.hero.maxHealth } }), 'Recovery complete. Automatic repeat is stopped; the Area is ready for Preparation.');
}

export function dispatch(state: GameState, command: Command): GameState {
  if (command.type === 'SELECT_AREA' && state.status === 'preparation') return selectAreaForPreparation(state, command.areaId);
  if (command.type === 'START_EXPEDITION' && state.status === 'preparation' && state.progression.preparation.activeSkillIds.length === 4) {
    const selectedBuff = state.progression.preparation.timedBuff;
    const canUseBuff = selectedBuff !== null && state.consumables.timedBuffs[selectedBuff] > 0;
    const started: GameState = {
      ...state,
      status: 'active',
      autoRepeat: true,
      outcome: null,
      committed: { experience: 0, currency: 0 },
      roomIndex: 0,
      consumables: canUseBuff ? { ...state.consumables, timedBuffs: { ...state.consumables.timedBuffs, [selectedBuff]: state.consumables.timedBuffs[selectedBuff] - 1 } } : state.consumables,
      combat: { ...state.combat, potionCooldowns: { health: 0, mana: 0 }, potionUses: {}, timedBuff: canUseBuff ? { kind: selectedBuff, remainingMilliseconds: 0 } : null },
    };
    const initialRoom = state.outcome === null && state.roomIndex === 0 ? started : enterRoom(started, 0);
    return addEvent(refreshProgressionPresentation(initialRoom), 'Expedition started. Preparation is locked.');
  }
  if (command.type === 'ADVANCE_TIME') return advance(state, command.milliseconds);
  if (command.type === 'WITHDRAW' && state.status === 'active') {
    const withdrawnOutcome = outcome(state, 'withdrawn', 0, false);
    const next = endExpeditionInPreparation({ ...state, autoRepeat: false }, withdrawnOutcome);
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
  if (command.type === 'SET_POTION_PREPARATION' && state.status === 'preparation' && command.thresholdPercent >= 0 && command.thresholdPercent <= 100) {
    return withPreparation(state, {
      ...state.progression.preparation,
      potions: { ...state.progression.preparation.potions, [command.potion]: { size: command.size, thresholdPercent: command.thresholdPercent } },
    });
  }
  if (command.type === 'SELECT_TIMED_BUFF' && state.status === 'preparation') {
    if (command.buff !== null && state.consumables.timedBuffs[command.buff] <= 0) return state;
    return withPreparation(state, { ...state.progression.preparation, timedBuff: command.buff });
  }
  if (command.type === 'EQUIP_ITEM' && state.status === 'preparation') return equipItem(state, command.itemId, command.equipmentSlot);
  if (command.type === 'SALVAGE_ITEM' && state.status === 'preparation') return salvageItem(state, command.itemId);
  return state;
}
