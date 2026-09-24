import { AFFIXES, AREAS, EXCEPTIONAL_ITEMS, ITEM_BASES, SKILLS } from './content';
import type { Affix, AreaDefinition, ContentValidationIssue, ContentValidationResult, EquipmentStats, Item, SkillDefinition } from './types';

type Catalog = {
  itemBases: typeof ITEM_BASES;
  affixes: Affix[];
  exceptionalItems: Item[];
};

const MAX_ROOMS = 100;
const MAX_ROOM_DURATION = 60 * 60 * 1_000;
const MAX_REWARD = 1_000_000;
const MAX_LEVEL = 100;
const slots = new Set(['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet']);
const stats = new Set<keyof EquipmentStats>(['attack', 'maxHealth', 'defense', 'attackInterval', 'maxMana']);
const areaKinds = new Set(['ordinary', 'boss', 'region-boss']);
const skillKinds = new Set(['active', 'passive', 'aura', 'ultimate', 'mastery']);
const skillTrees = new Set(['physical', 'tank', 'magic', 'general']);

export function validateContent(areas: AreaDefinition[] = AREAS, skills: SkillDefinition[] = SKILLS, catalog: Catalog = { itemBases: ITEM_BASES, affixes: AFFIXES, exceptionalItems: EXCEPTIONAL_ITEMS }): ContentValidationResult {
  const issues: ContentValidationIssue[] = [];
  const add = (code: string, message: string, path: string) => issues.push({ code, message, path });
  const finiteRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const integerRange = (value: unknown, min: number, max: number) => Number.isInteger(value) && finiteRange(value, min, max);
  const identifier = (id: string, path: string, seen: Set<string>) => {
    if (typeof id !== 'string' || !id.trim()) add('empty-id', 'Identifier must be a non-empty string', path);
    else if (seen.has(id)) add('duplicate-id', `Duplicate identifier ${id}`, path);
    seen.add(id);
  };
  const checkStats = (values: Partial<EquipmentStats>, path: string) => {
    for (const [stat, value] of Object.entries(values ?? {})) {
      if (!stats.has(stat as keyof EquipmentStats) || !Number.isFinite(value) || (stat !== 'attackInterval' && value < 0) || (stat === 'attackInterval' && value > 0)) {
        add('invalid-item-stat', `Invalid ${stat} stat`, `${path}.${stat}`);
      }
    }
  };

  const skillIds = new Set<string>();
  skills.forEach((skill, index) => {
    const path = `skills[${index}]`;
    identifier(skill.id, `${path}.id`, skillIds);
    if (!skillKinds.has(skill.kind)) add('invalid-skill-kind', `Unknown Skill kind ${skill.kind}`, `${path}.kind`);
    if (!skillTrees.has(skill.tree)) add('invalid-skill-tree', `Unknown Skill tree ${skill.tree}`, `${path}.tree`);
    if (!integerRange(skill.maxRank, 1, 20)) add('invalid-skill-values', 'Skill maxRank must be an integer from 1 to 20', `${path}.maxRank`);
    if (!integerRange(skill.unlockLevel, 1, MAX_LEVEL)) add('invalid-skill-values', `Skill unlockLevel must be from 1 to ${MAX_LEVEL}`, `${path}.unlockLevel`);
    if (!finiteRange(skill.manaCost, 0, MAX_REWARD)) add('invalid-skill-values', 'Skill manaCost must be finite and non-negative', `${path}.manaCost`);
    if (!integerRange(skill.cooldownMilliseconds, 0, MAX_ROOM_DURATION)) add('invalid-skill-values', 'Skill cooldown must be a bounded number of milliseconds', `${path}.cooldownMilliseconds`);
    if (skill.damageMultiplier !== undefined && !finiteRange(skill.damageMultiplier, 0, 100)) add('invalid-skill-values', 'Skill damageMultiplier must be finite and non-negative', `${path}.damageMultiplier`);
    const prerequisites = new Set<string>();
    if (!Array.isArray(skill.prerequisites)) add('invalid-prerequisites', `Skill ${skill.id} needs a prerequisite list`, `${path}.prerequisites`);
    (Array.isArray(skill.prerequisites) ? skill.prerequisites : []).forEach((prerequisite, prerequisiteIndex) => {
      if (prerequisites.has(prerequisite)) add('duplicate-prerequisite', `Skill ${skill.id} repeats prerequisite ${prerequisite}`, `${path}.prerequisites[${prerequisiteIndex}]`);
      prerequisites.add(prerequisite);
      if (!skills.some((candidate) => candidate.id === prerequisite)) add('skill-reference', `Skill ${skill.id} references missing prerequisite ${prerequisite}`, `${path}.prerequisites[${prerequisiteIndex}]`);
    });
  });
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const skillReachable = (id: string, visiting = new Set<string>()): boolean => {
    const skill = skillById.get(id);
    if (!skill || visiting.has(id)) return false;
    visiting.add(id);
    return Array.isArray(skill.prerequisites) && skill.prerequisites.every((prerequisite) => skillReachable(prerequisite, new Set(visiting)));
  };
  skills.forEach((skill, index) => {
    if (!skillReachable(skill.id)) add('unreachable-skill', `Skill ${skill.id} has a missing or cyclic prerequisite chain`, `skills[${index}].prerequisites`);
  });

  const areaIds = new Set<string>();
  if (areas.length === 0 || !areas.some((area) => area.unlock?.type === 'start')) add('missing-start-area', 'Content needs a start Area', 'areas');
  areas.forEach((area, index) => {
    const path = `areas[${index}]`;
    identifier(area.id, `${path}.id`, areaIds);
    if (!areaKinds.has(area.kind)) add('invalid-area-kind', `Unknown Area kind ${area.kind}`, `${path}.kind`);
    if (typeof area.name !== 'string' || !area.name.trim()) add('empty-name', 'Area name must not be empty', `${path}.name`);
    const rooms = Array.isArray(area.rooms) ? area.rooms : [];
    const encounterTable = Array.isArray(area.encounterTable) ? area.encounterTable : [];
    if (!Array.isArray(area.rooms)) add('invalid-room-sequence', `Area ${area.id} needs a Room sequence`, `${path}.rooms`);
    else if (!integerRange(rooms.length, 1, MAX_ROOMS)) add(rooms.length === 0 ? 'empty-rooms' : 'room-safety-bound', `Area ${area.id} needs 1 to ${MAX_ROOMS} Rooms`, `${path}.rooms`);
    if (!Array.isArray(area.encounterTable)) add('invalid-encounter-table', `Area ${area.id} needs an encounter table`, `${path}.encounterTable`);
    else if (encounterTable.length === 0) add('empty-encounter-table', `Area ${area.id} needs an encounter table`, `${path}.encounterTable`);
    const encounterNames = new Set<string>();
    encounterTable.forEach((name, encounterIndex) => {
      if (typeof name !== 'string' || !name.trim()) add('empty-encounter', 'Encounter name must not be empty', `${path}.encounterTable[${encounterIndex}]`);
      if (encounterNames.has(name)) add('duplicate-encounter', `Encounter ${name} is repeated`, `${path}.encounterTable[${encounterIndex}]`);
      encounterNames.add(name);
    });
    rooms.forEach((room, roomIndex) => {
      const roomPath = `${path}.rooms[${roomIndex}]`;
      if (!room || typeof room !== 'object') {
        add('invalid-room-type', 'Room must be an object with a valid type', roomPath);
        return;
      }
      for (const reward of ['experience', 'currency'] as const) {
        if (!integerRange(room[reward], 0, MAX_REWARD)) add('invalid-room-values', `${reward} must be an integer from 0 to ${MAX_REWARD}`, `${roomPath}.${reward}`);
      }
      if (room.type === 'combat') {
        if (!room.enemy || typeof room.enemy !== 'object') add('missing-enemy', 'Combat Room must define an enemy', `${roomPath}.enemy`);
        else {
          if (!encounterNames.has(room.enemy.name)) add('encounter-reference', `Enemy ${room.enemy.name} is missing from Area ${area.id}'s encounter table`, `${roomPath}.enemy.name`);
          if (!finiteRange(room.enemy.health, 1, MAX_REWARD)) add('invalid-room-values', 'Enemy health must be finite and positive', `${roomPath}.enemy.health`);
          if (!finiteRange(room.enemy.attack, 0, MAX_REWARD)) add('invalid-room-values', 'Enemy attack must be finite and non-negative', `${roomPath}.enemy.attack`);
          if (room.enemy.defense !== undefined && !finiteRange(room.enemy.defense, 0, MAX_REWARD)) add('invalid-room-values', 'Enemy defense must be finite and non-negative', `${roomPath}.enemy.defense`);
        }
        if (room.championChance !== undefined && !finiteRange(room.championChance, 0, 1)) add('invalid-room-values', 'Champion chance must be between 0 and 1', `${roomPath}.championChance`);
        if (area.kind !== 'ordinary' && room.championChance !== undefined && room.championChance !== 0) add('boss-champion', 'Boss Rooms cannot roll Champions', `${roomPath}.championChance`);
      } else if (room.type === 'empty') {
        if (!integerRange(room.durationMilliseconds, 1, MAX_ROOM_DURATION)) add('invalid-room-values', 'Empty Room duration must be positive and bounded', `${roomPath}.durationMilliseconds`);
        if (!finiteRange(room.healthEffect, -MAX_REWARD, MAX_REWARD)) add('invalid-room-values', 'Health effect must be finite and bounded', `${roomPath}.healthEffect`);
        if (!finiteRange(room.manaEffect, -MAX_REWARD, MAX_REWARD)) add('invalid-room-values', 'Mana effect must be finite and bounded', `${roomPath}.manaEffect`);
      } else {
        add('invalid-room-type', `Unknown Room type ${(room as { type: string }).type}`, `${roomPath}.type`);
      }
    });
    const unlock = area.unlock;
    if (!unlock || typeof unlock !== 'object') add('invalid-unlock', `Area ${area.id} needs an unlock rule`, `${path}.unlock`);
    else if (unlock.type === 'complete-area') {
      if (!areas.some((candidate) => candidate.id === unlock.areaId)) add('area-reference', `Area ${area.id} references missing unlock Area ${unlock.areaId}`, `${path}.unlock.areaId`);
      if (!integerRange(unlock.completions, 1, MAX_REWARD)) add('invalid-unlock', 'Completion requirement must be a positive bounded integer', `${path}.unlock.completions`);
    }
    else if (unlock.type !== 'start') add('invalid-unlock', `Unknown Area unlock type ${(unlock as { type: string }).type}`, `${path}.unlock.type`);
    if (area.kind === 'ordinary' && area.boss) add('boss-definition', 'Ordinary Area cannot define a Boss', `${path}.boss`);
    if (area.kind === 'boss' || area.kind === 'region-boss') {
      if (typeof area.boss?.name !== 'string' || !area.boss.name.trim()) add('boss-definition', `Boss Area ${area.id} must define a Boss`, `${path}.boss`);
      else {
        if (!encounterNames.has(area.boss.name)) add('boss-reference', `Boss ${area.boss.name} is missing from Area ${area.id}'s encounter table`, `${path}.boss.name`);
        const finalRoom = rooms.at(-1);
        if (!finalRoom || finalRoom.type !== 'combat' || finalRoom.enemy?.name !== area.boss.name) add('boss-room', `Area ${area.id}'s final Room must contain Boss ${area.boss.name}`, `${path}.rooms`);
      }
    }
    if (area.kind === 'region-boss' && !integerRange(area.attemptCost ?? 0, 1, MAX_REWARD)) add('region-boss-cost', 'Region Boss attempt cost must be a positive bounded integer', `${path}.attemptCost`);
    if (area.kind !== 'region-boss' && area.attemptCost !== undefined) add('attempt-cost', 'Only a Region Boss may have an attempt cost', `${path}.attemptCost`);
  });
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const areaReachable = (id: string, visiting = new Set<string>()): boolean => {
    const area = areaById.get(id);
    if (!area || visiting.has(id)) return false;
    if (!area.unlock) return false;
    if (area.unlock.type === 'start') return true;
    if (area.unlock.type !== 'complete-area') return false;
    visiting.add(id);
    return areaReachable(area.unlock.areaId, visiting);
  };
  areas.forEach((area, index) => {
    if (!areaReachable(area.id)) add('unreachable-area', `Area ${area.id} cannot be reached from a start Area`, `areas[${index}].unlock`);
  });

  const affixIds = new Set<string>();
  if (!Array.isArray(catalog.affixes)) add('invalid-affixes', 'Catalog needs an Affix list', 'affixes');
  (Array.isArray(catalog.affixes) ? catalog.affixes : []).forEach((affix, index) => {
    const path = `affixes[${index}]`;
    if (!affix || typeof affix !== 'object') { add('invalid-affix-value', 'Affix must be an object', path); return; }
    identifier(affix.id, `${path}.id`, affixIds);
    if (!slots.has(affix.slot)) add('invalid-slot', `Unknown Affix slot ${affix.slot}`, `${path}.slot`);
    if (!stats.has(affix.stat) || !Number.isFinite(affix.value) || (affix.stat === 'attackInterval' ? affix.value >= 0 : affix.value <= 0)) add('invalid-affix-value', `Affix ${affix.id} has an invalid stat or value`, `${path}.value`);
  });
  if (!catalog.itemBases || typeof catalog.itemBases !== 'object') add('invalid-item-bases', 'Catalog needs Item bases', 'itemBases');
  for (const [id, base] of Object.entries(catalog.itemBases ?? {})) {
    if (!id.trim()) add('empty-id', 'Item base id must not be empty', 'itemBases');
    if (!base || typeof base !== 'object') { add('invalid-item-base', `Item base ${id} must be an object`, `itemBases.${id}`); continue; }
    if (!slots.has(base.slot)) add('invalid-slot', `Item base ${id} has an unknown slot`, `itemBases.${id}.slot`);
    checkStats(base.stats, `itemBases.${id}.stats`);
  }
  const exceptionalIds = new Set<string>();
  if (!Array.isArray(catalog.exceptionalItems)) add('invalid-exceptional-items', 'Catalog needs an Exceptional Item list', 'exceptionalItems');
  (Array.isArray(catalog.exceptionalItems) ? catalog.exceptionalItems : []).forEach((item, index) => {
    const path = `exceptionalItems[${index}]`;
    if (!item || typeof item !== 'object') { add('invalid-exceptional-item', 'Exceptional Item must be an object', path); return; }
    identifier(item.id, `${path}.id`, exceptionalIds);
    if (!slots.has(item.slot)) add('invalid-slot', `Exceptional Item ${item.id} has an unknown slot`, `${path}.slot`);
    if (!item.exceptional || !item.identified) add('invalid-exceptional-item', `Exceptional Item ${item.id} must be identified and exceptional`, path);
    checkStats(item.baseStats, `${path}.baseStats`);
    if (!Array.isArray(item.affixes)) add('invalid-affixes', `Exceptional Item ${item.id} needs an Affix list`, `${path}.affixes`);
    (Array.isArray(item.affixes) ? item.affixes : []).forEach((affix, affixIndex) => {
      if (!affix || typeof affix !== 'object') { add('invalid-affix-value', 'Affix must be an object', `${path}.affixes[${affixIndex}]`); return; }
      if (affix.slot !== item.slot) add('affix-compatibility', `Affix ${affix.id} cannot be used on ${item.slot}`, `${path}.affixes[${affixIndex}]`);
      if (!stats.has(affix.stat) || !Number.isFinite(affix.value)) add('invalid-affix-value', `Invalid Affix ${affix.id}`, `${path}.affixes[${affixIndex}].value`);
    });
  });
  return { valid: issues.length === 0, issues };
}

export function assertAuthoredContentValid(): void {
  const result = validateContent();
  if (!result.valid) throw new Error(`Authored Content is invalid:\n${result.issues.map(({ path, message }) => `${path}: ${message}`).join('\n')}`);
}
