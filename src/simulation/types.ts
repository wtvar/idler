export type ExpeditionStatus = 'preparation' | 'active' | 'completed' | 'withdrawn' | 'defeated' | 'recovery';

export type Command =
  | { type: 'START_EXPEDITION' }
  | { type: 'ADVANCE_TIME'; milliseconds: number }
  | { type: 'WITHDRAW' }
  | { type: 'STOP_AUTO_REPEAT' }
  | { type: 'SPEND_ATTRIBUTE'; attribute: Attribute }
  | { type: 'INVEST_SKILL'; skillId: string }
  | { type: 'RESPEC_SKILLS' }
  | { type: 'TOGGLE_ACTIVE_SKILL'; skillId: string }
  | { type: 'SELECT_AURA'; skillId: string | null }
  | { type: 'SELECT_ULTIMATE'; skillId: string | null }
  | { type: 'SET_TARGET_POLICY'; policy: TargetPolicy }
  | { type: 'SET_SKILL_TARGET_POLICY'; skillId: string; policy: TargetPolicy }
  | { type: 'EQUIP_ITEM'; itemId: string; equipmentSlot?: EquipmentPosition }
  | { type: 'SALVAGE_ITEM'; itemId: string };

export type SkillTree = 'physical' | 'tank' | 'magic' | 'general';
export type SkillKind = 'active' | 'passive' | 'aura' | 'ultimate' | 'mastery';
export type TargetPolicy = 'first' | 'last' | 'lowest-health' | 'highest-health' | 'boss-champion-first';

export type SkillDefinition = {
  id: string;
  name: string;
  tree: SkillTree;
  kind: SkillKind;
  unlockLevel: number;
  prerequisites: string[];
  maxRank: number;
  manaCost: number;
  cooldownMilliseconds: number;
  description: string;
  damageMultiplier?: number;
  targetPolicy?: TargetPolicy;
};

export type Preparation = {
  activeSkillIds: string[];
  auraId: string | null;
  ultimateId: string | null;
  targetPolicy: TargetPolicy;
  skillTargetPolicies: Record<string, TargetPolicy>;
};

export type Attribute = 'might' | 'vitality' | 'agility' | 'focus';

export type EquipmentSlot = 'weapon' | 'helm' | 'chest' | 'gloves' | 'boots' | 'ring' | 'amulet';
export type EquipmentPosition = Exclude<EquipmentSlot, 'ring'> | 'ring1' | 'ring2';
export type ItemQuality = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type EquipmentStats = { attack: number; maxHealth: number; defense: number; attackInterval: number; maxMana: number };
export type Affix = { id: string; name: string; slot: EquipmentSlot; stat: keyof EquipmentStats; value: number };
export type Item = {
  id: string;
  name: string;
  slot: EquipmentSlot;
  quality: ItemQuality;
  identified: true;
  exceptional: boolean;
  baseStats: Partial<EquipmentStats>;
  affixes: Affix[];
};
export type Equipment = Record<EquipmentPosition, Item | null>;

export type ProgressionState = {
  level: number;
  experience: number;
  attributePoints: number;
  skillPoints: number;
  attributes: Record<Attribute, number>;
  skillRanks: Record<string, number>;
  preparation: Preparation;
};

export type Event = { id: number; timestampMilliseconds: number; message: string };

export type StatusEffect = {
  name: 'bleed' | 'burn' | 'slow' | 'stun';
  remainingMilliseconds: number;
  magnitude: number;
};

export type CombatState = {
  pendingMilliseconds: number;
  heroAttackProgress: number;
  enemyAttackProgress: number;
  heroMana: number;
  maxMana: number;
  heroManaRegeneration: number;
  heroHealthRegeneration: number;
  heroDefense: number;
  enemyAttack: number;
  enemyDefense: number;
  heroCooldowns: Record<string, number>;
  heroStatuses: StatusEffect[];
  enemyStatuses: StatusEffect[];
  targetPolicy: TargetPolicy;
};

export type ExpeditionOutcome = {
  result: 'completed' | 'withdrawn' | 'defeated';
  roomReached: number;
  committed: { experience: number; currency: number };
  lost: { experience: number; currency: number };
  recoveryMilliseconds: number;
  willRestart: boolean;
};

export type GameState = {
  simulationVersion: string;
  seed: number;
  elapsedMilliseconds: number;
  status: ExpeditionStatus;
  areaName: string;
  roomIndex: number;
  roomCount: number;
  roomType: 'combat' | 'empty' | 'complete';
  hero: { name: string; health: number; maxHealth: number; attack: number; attackInterval: number };
  enemy: { name: string; health: number; maxHealth: number } | null;
  currency: number;
  committed: { experience: number; currency: number };
  recoveryRemainingMilliseconds: number;
  autoRepeat: boolean;
  outcome: ExpeditionOutcome | null;
  events: Event[];
  progression: ProgressionState;
  skills: SkillDefinition[];
  reviewQueue: string[];
  combat: CombatState;
  equipment: Equipment;
  inventory: Item[];
  nextItemId: number;
};
