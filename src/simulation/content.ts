import type { Affix, AreaDefinition, EquipmentStats, Item, SkillDefinition } from './types';

export const FIRST_AREA = {
  id: 'sunlit-meadow',
  name: 'Sunlit Meadow',
  rooms: [
    { type: 'combat' as const, enemy: { name: 'Meadow Slime', health: 18, attack: 2 }, experience: 10, currency: 2 },
    { type: 'empty' as const, durationMilliseconds: 100, healthEffect: 8, manaEffect: 4, experience: 5, currency: 1 },
    { type: 'combat' as const, enemy: { name: 'Thornback', health: 24, attack: 3, defense: 10 }, experience: 15, currency: 3 },
  ],
};

const REGION_NAMES = ['Sunlit Meadow', 'Moonlit Grove', 'Whispering Fen', 'Amber Foothills', 'Cinderstep Pass', 'Silverpine Reach', 'Hollow Coast', 'Starfall Basin', 'Mossglass Wilds', 'Dawnstone Fields', 'Glimmering Vale', 'Ashen Orchard', 'Cloudbreak Ridge', 'Sable Marsh', 'Frostwillow Path', 'Redleaf Crossing', 'Nightbloom Hollow', 'Goldenwater Flats', 'Stormwatch Cliffs', 'Crown of Dawn'];
const ENEMY_ARCHETYPES = [
  { name: 'Wayward Slime', health: 24, attack: 2, defense: 2 },
  { name: 'Bramblefang', health: 31, attack: 3, defense: 8 },
  { name: 'Stoneback', health: 42, attack: 4, defense: 16 },
  { name: 'Dusk Hound', health: 36, attack: 5, defense: 10 },
  { name: 'Ember Moth', health: 29, attack: 5, defense: 6 },
  { name: 'Ridge Troll', health: 52, attack: 6, defense: 20 },
];

function completeRoomSequence(rooms: AreaDefinition['rooms'], areaNumber: number, target = 12): AreaDefinition['rooms'] {
  const completed = [...rooms];
  while (completed.length < target) {
    const index = completed.length;
    if (index % 5 === 3) {
      completed.push({ type: 'empty', durationMilliseconds: 200, healthEffect: 12, manaEffect: 6, experience: 6 + areaNumber, currency: 2 + Math.floor(areaNumber / 4) });
      continue;
    }
    const archetype = ENEMY_ARCHETYPES[(areaNumber + index) % ENEMY_ARCHETYPES.length];
    const scale = 1 + (areaNumber - 1) * 0.12;
    completed.push({
      type: 'combat',
      enemy: { name: archetype.name, health: Math.round(archetype.health * scale), attack: Math.max(2, Math.round(archetype.attack * scale)), defense: Math.round(archetype.defense * scale) },
      experience: 12 + areaNumber * 2 + index,
      currency: 3 + Math.floor(areaNumber / 3),
      championChance: 0.05 + Math.min(0.05, areaNumber * 0.0025),
    });
  }
  return completed;
}

function authoredRooms(areaNumber: number) {
  const scale = 1 + (areaNumber - 1) * 0.12;
  return Array.from({ length: 12 }, (_, index) => {
    if (index === 3 || index === 8) return { type: 'empty' as const, durationMilliseconds: 200, healthEffect: 8 + areaNumber, manaEffect: 4, experience: 5 + areaNumber, currency: 2 + Math.floor(areaNumber / 4) };
    const archetype = ENEMY_ARCHETYPES[(areaNumber + index) % ENEMY_ARCHETYPES.length];
    return {
      type: 'combat' as const,
      enemy: { name: archetype.name, health: Math.round(archetype.health * scale), attack: Math.max(2, Math.round(archetype.attack * scale)), defense: Math.round(archetype.defense * scale) },
      experience: 12 + areaNumber * 2 + index,
      currency: 3 + Math.floor(areaNumber / 3),
      championChance: index > 0 ? Math.min(0.1, 0.05 + areaNumber * 0.0025) : 0,
    };
  });
}

const ordinaryAreas: AreaDefinition[] = REGION_NAMES.map((name, index) => ({
  id: index === 0 ? 'sunlit-meadow' : index === 1 ? 'moonlit-grove' : `region-area-${index + 1}`,
  name,
  kind: 'ordinary',
  unlock: index === 0 ? { type: 'start' } : { type: 'complete-area', areaId: index === 1 ? 'sunlit-meadow' : index === 2 ? 'moonlit-grove' : `region-area-${index}`, completions: 1 },
  rooms: index === 0 ? completeRoomSequence(FIRST_AREA.rooms, 1) : index === 1 ? completeRoomSequence([
    { type: 'combat' as const, enemy: { name: 'Grove Stag', health: 28, attack: 4, defense: 8 }, experience: 18, currency: 4 },
    { type: 'empty' as const, durationMilliseconds: 200, healthEffect: 6, manaEffect: 5, experience: 7, currency: 2 },
    { type: 'combat' as const, enemy: { name: 'Moonroot Guardian', health: 34, attack: 5, defense: 14 }, experience: 24, currency: 5 },
  ], 2) : authoredRooms(index + 1),
  encounterTable: index === 0 ? ['Meadow Slime', 'Thornback', ...ENEMY_ARCHETYPES.map(({ name: enemyName }) => enemyName)] : index === 1 ? ['Grove Stag', 'Moonroot Guardian', ...ENEMY_ARCHETYPES.map(({ name: enemyName }) => enemyName)] : ENEMY_ARCHETYPES.map(({ name: enemyName }) => enemyName),
}));

const chapterBosses: AreaDefinition[] = [5, 10, 15, 20].map((areaNumber) => ({
  id: `region-chapter-boss-${areaNumber}`,
  name: `${REGION_NAMES[areaNumber - 1]} Chapter Boss`,
  kind: 'boss',
  unlock: { type: 'complete-area', areaId: `region-area-${areaNumber}`, completions: 2 },
  encounterTable: [`Chapter Warden ${areaNumber}`, ...ENEMY_ARCHETYPES.map(({ name: enemyName }) => enemyName)],
  boss: { name: `Chapter Warden ${areaNumber}` },
  rooms: [
    ...completeRoomSequence([{ type: 'empty' as const, durationMilliseconds: 300, healthEffect: 15, manaEffect: 8, experience: 10, currency: 4 }], areaNumber, 11).map((room) => room.type === 'combat' ? { ...room, championChance: 0 } : room),
    { type: 'combat' as const, enemy: { name: `Chapter Warden ${areaNumber}`, health: 90 + areaNumber * 8, attack: 8 + Math.floor(areaNumber / 5), defense: 22 + areaNumber }, experience: 70 + areaNumber * 5, currency: 20 + areaNumber, championChance: 0 },
  ],
}));

export const REGION_BOSS_ID = 'region-boss-crown-of-dawn';
export const REGION_BOSS_ATTEMPT_COST = 120;

export const AREAS: AreaDefinition[] = [
  ...ordinaryAreas,
  ...chapterBosses,
  {
    id: REGION_BOSS_ID,
    name: 'Crown of Dawn Region Boss',
    kind: 'region-boss',
    unlock: { type: 'complete-area', areaId: 'region-area-20', completions: 1 },
    attemptCost: REGION_BOSS_ATTEMPT_COST,
    encounterTable: ['The Dawn Sovereign', ...ENEMY_ARCHETYPES.map(({ name: enemyName }) => enemyName)],
    boss: { name: 'The Dawn Sovereign' },
    rooms: [
      ...completeRoomSequence([], 20, 9).map((room) => room.type === 'combat' ? { ...room, championChance: 0 } : room),
      { type: 'combat', enemy: { name: 'The Dawn Sovereign', health: 260, attack: 14, defense: 35 }, experience: 250, currency: 80, championChance: 0 },
      { type: 'combat', enemy: { name: 'The Dawn Sovereign', health: 320, attack: 16, defense: 40 }, experience: 350, currency: 120, championChance: 0 },
    ],
  },
];

export const SKILLS: SkillDefinition[] = [
  { id: 'physical-strike', name: 'Measured Strike', tree: 'physical', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A reliable weapon attack.', damageMultiplier: 1 },
  { id: 'physical-cleave', name: 'Cleave', tree: 'physical', kind: 'active', unlockLevel: 5, prerequisites: ['physical-strike'], maxRank: 20, manaCost: 5, cooldownMilliseconds: 2_000, description: 'A heavier attack against the current target.', damageMultiplier: 1.3 },
  { id: 'physical-tempo', name: 'Battle Tempo', tree: 'physical', kind: 'passive', unlockLevel: 10, prerequisites: ['physical-strike'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve the Hero attack interval.' },
  { id: 'physical-ultimate', name: 'Execution', tree: 'physical', kind: 'ultimate', unlockLevel: 20, prerequisites: ['physical-cleave'], maxRank: 5, manaCost: 15, cooldownMilliseconds: 10_000, description: 'A decisive physical attack.', damageMultiplier: 2 },
  { id: 'tank-guard', name: 'Guard', tree: 'tank', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A guarded attack that improves survivability.', damageMultiplier: 1 },
  { id: 'tank-reprisal', name: 'Reprisal', tree: 'tank', kind: 'active', unlockLevel: 5, prerequisites: ['tank-guard'], maxRank: 20, manaCost: 5, cooldownMilliseconds: 3_000, description: 'A defensive counterattack.', damageMultiplier: 1.2 },
  { id: 'tank-fortitude', name: 'Fortitude', tree: 'tank', kind: 'passive', unlockLevel: 10, prerequisites: ['tank-guard'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve maximum Health.' },
  { id: 'tank-ultimate', name: 'Last Stand', tree: 'tank', kind: 'ultimate', unlockLevel: 20, prerequisites: ['tank-reprisal'], maxRank: 5, manaCost: 15, cooldownMilliseconds: 10_000, description: 'A powerful attack born from defence.', damageMultiplier: 1.8 },
  { id: 'magic-bolt', name: 'Arcane Bolt', tree: 'magic', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 5, cooldownMilliseconds: 1_000, description: 'A Mana-powered attack.', damageMultiplier: 1.4 },
  { id: 'magic-focus', name: 'Focused Mind', tree: 'magic', kind: 'passive', unlockLevel: 10, prerequisites: ['magic-bolt'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve maximum Mana.' },
  { id: 'magic-aura', name: 'Arcane Aura', tree: 'magic', kind: 'aura', unlockLevel: 10, prerequisites: ['magic-bolt'], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'The selected Aura improves Mana regeneration.' },
  { id: 'magic-ultimate', name: 'Meteor', tree: 'magic', kind: 'ultimate', unlockLevel: 20, prerequisites: ['magic-bolt'], maxRank: 5, manaCost: 20, cooldownMilliseconds: 12_000, description: 'A devastating arcane attack.', damageMultiplier: 2.2 },
  { id: 'general-quickness', name: 'Quickness', tree: 'general', kind: 'passive', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve attack speed.' },
  { id: 'general-challenge', name: 'Challenge', tree: 'general', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A dependable opening attack.', damageMultiplier: 1 },
  { id: 'general-focus', name: 'Battle Focus', tree: 'general', kind: 'aura', unlockLevel: 1, prerequisites: [], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'The selected Aura improves Health and Mana regeneration.' },
  { id: 'general-mastery', name: 'Adaptive Mastery', tree: 'general', kind: 'mastery', unlockLevel: 30, prerequisites: ['general-quickness'], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'A late Build specialisation.' },
];

const TREE_NAMES = { physical: 'Physical', tank: 'Tank', magic: 'Magic' } as const;
const ADDITIONAL_SKILLS = {
  physical: {
    active: ['Lunge', 'Whirlwind', 'Armor Break', 'Flurry', 'Rending Cut', 'Reckoning', 'Rising Edge', 'Overpower'],
    passive: ['Weapon Control', 'Precision', 'Deep Cut', 'Relentless Pace'],
    ultimate: ['Final Blow'],
    mastery: ['Weapon Mastery'],
  },
  tank: {
    active: ['Shield Bash', 'Taunting Blow', 'Bulwark Strike', 'Counterattack', 'Iron Wave', 'Hold the Line', 'Shield Rush', 'Lasting Guard'],
    passive: ['Iron Skin', 'Steadfast', 'Measured Retaliation', 'Stalwart Recovery'],
    ultimate: ['Unbreakable Stand'],
    mastery: ['Bulwark Mastery'],
  },
  magic: {
    active: ['Arcane Lance', 'Frost Shard', 'Flame Burst', 'Mana Surge', 'Starfall', 'Rift Bolt', 'Astral Wave', 'Singularity', 'Comet'],
    passive: ['Deep Reservoir', 'Efficient Channeling', 'Spellcraft', 'Mana Conduit'],
    ultimate: ['Astral Cataclysm'],
    mastery: ['Arcane Mastery'],
  },
} as const;
const PASSIVE_EFFECTS = {
  physical: [
    { stat: 'attack', valuePerRank: 0.25 }, { stat: 'attack', valuePerRank: 0.35 },
    { stat: 'attack', valuePerRank: 0.45 }, { stat: 'attackInterval', valuePerRank: -15 },
  ],
  tank: [
    { stat: 'defense', valuePerRank: 0.5 }, { stat: 'maxHealth', valuePerRank: 2 },
    { stat: 'healthRegeneration', valuePerRank: 0.1 }, { stat: 'defense', valuePerRank: 0.75 },
  ],
  magic: [
    { stat: 'maxMana', valuePerRank: 2 }, { stat: 'manaRegeneration', valuePerRank: 0.15 },
    { stat: 'attack', valuePerRank: 0.25 }, { stat: 'manaRegeneration', valuePerRank: 0.2 },
  ],
} as const;
for (const tree of Object.keys(TREE_NAMES) as Array<keyof typeof TREE_NAMES>) {
  const existing = SKILLS.filter((skill) => skill.tree === tree);
  const root = existing.find((skill) => skill.kind === 'active')!;
  const fill = (kind: SkillDefinition['kind'], count: number, prefix: string) => {
    const current = SKILLS.filter((skill) => skill.tree === tree && skill.kind === kind).length;
    for (let index = current; index < count; index += 1) {
      const rank = index + 1;
      const id = `${tree}-${prefix}-${rank}`;
      const name = ADDITIONAL_SKILLS[tree][prefix as keyof typeof ADDITIONAL_SKILLS[typeof tree]][index - current];
      const passiveEffect = kind === 'passive' ? PASSIVE_EFFECTS[tree][index - current] : undefined;
      SKILLS.push({
        id,
        name,
        tree,
        kind,
        unlockLevel: kind === 'mastery' ? 30 : kind === 'ultimate' ? 20 : kind === 'passive' ? Math.min(25, 5 + rank * 4) : Math.min(25, 1 + rank * 2),
        prerequisites: [root.id],
        maxRank: kind === 'mastery' ? 1 : kind === 'ultimate' ? 5 : 20,
        manaCost: kind === 'active' || kind === 'ultimate' ? 4 + rank : 0,
        cooldownMilliseconds: kind === 'active' || kind === 'ultimate' ? 1_000 + rank * 250 : 0,
        description: kind === 'passive' && passiveEffect
          ? passiveEffect.stat === 'attackInterval'
            ? `Reduces the Hero attack interval by ${Math.abs(passiveEffect.valuePerRank)} ms per rank.`
            : `Increases ${passiveEffect.stat} by ${passiveEffect.valuePerRank} per rank.`
          : kind === 'mastery'
            ? `Level-30 specialisation that deepens the ${TREE_NAMES[tree]} Build direction.`
            : `${name} is a ${TREE_NAMES[tree].toLowerCase()} attack that deals increased damage.`,
        ...(kind === 'active' || kind === 'ultimate' ? { damageMultiplier: 1 + rank * 0.05 } : {}),
        ...(passiveEffect ? { passiveEffect } : {}),
      });
    }
  };
  fill('active', 10, 'active');
  fill('passive', 5, 'passive');
  fill('ultimate', 2, 'ultimate');
  fill('mastery', 1, 'mastery');
}

export const ITEM_QUALITY_MULTIPLIERS = {
  Common: 1,
  Uncommon: 1.2,
  Rare: 1.45,
  Epic: 1.75,
  Legendary: 2.1,
} as const;

export const EXCEPTIONAL_ITEMS: Item[] = [
  {
    id: 'exceptional-meadowguard-mail', name: 'Meadowguard Mail', slot: 'chest', quality: 'Rare', identified: true,
    exceptional: true, baseStats: { maxHealth: 18, defense: 4 },
    affixes: [{ id: 'thornbound', name: 'Thornbound', slot: 'chest', stat: 'defense', value: 3 }],
  },
];

export const ITEM_BASES: Record<string, { name: string; slot: Item['slot']; stats: Partial<EquipmentStats> }> = {
  'iron-sword': { name: 'Iron Sword', slot: 'weapon', stats: { attack: 4 } },
  'linen-helm': { name: 'Linen Helm', slot: 'helm', stats: { maxHealth: 8 } },
  'woven-vest': { name: 'Woven Vest', slot: 'chest', stats: { maxHealth: 12 } },
  'leather-gloves': { name: 'Leather Gloves', slot: 'gloves', stats: { attack: 1 } },
  'trail-boots': { name: 'Trail Boots', slot: 'boots', stats: { attackInterval: -45 } },
  'copper-ring': { name: 'Copper Ring', slot: 'ring', stats: { attack: 2 } },
  'moon-amulet': { name: 'Moon Amulet', slot: 'amulet', stats: { maxMana: 5 } },
};

export const AFFIXES: Affix[] = [
  { id: 'might', name: 'of Might', slot: 'weapon', stat: 'attack', value: 2 },
  { id: 'guarding', name: 'of Guarding', slot: 'helm', stat: 'defense', value: 2 },
  { id: 'grip', name: 'of Grip', slot: 'gloves', stat: 'attack', value: 1 },
  { id: 'vitality', name: 'of Vitality', slot: 'chest', stat: 'maxHealth', value: 10 },
  { id: 'swiftness', name: 'of Swiftness', slot: 'boots', stat: 'attackInterval', value: -35 },
  { id: 'focus', name: 'of Focus', slot: 'ring', stat: 'maxMana', value: 4 },
  { id: 'clarity', name: 'of Clarity', slot: 'amulet', stat: 'maxMana', value: 6 },
];
