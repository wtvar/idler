export type ExpeditionStatus = 'preparation' | 'active' | 'completed' | 'withdrawn' | 'defeated' | 'recovery';

export type AreaKind = 'ordinary' | 'boss' | 'region-boss';
export type AreaUnlockRequirement = { type: 'start' } | { type: 'complete-area'; areaId: string; completions: number };
export type RoomDefinition =
  | { type: 'combat'; enemy: { name: string; health: number; attack: number; defense?: number }; experience: number; currency: number; championChance?: number }
  | { type: 'empty'; durationMilliseconds: number; healthEffect: number; manaEffect: number; experience: number; currency: number };
export type AreaDefinition = { id: string; name: string; kind: AreaKind; unlock: AreaUnlockRequirement; rooms: RoomDefinition[]; encounterTable: string[]; boss?: { name: string }; attemptCost?: number };
export type AreaCompletion = { completions: number };
export type AreaMapStatus = 'locked' | 'unlocked' | 'completed' | 'replayable' | 'boss';
export type AreaMapEntry = AreaDefinition & { status: AreaMapStatus; completions: number };

export type Command =
  | { type: 'START_EXPEDITION' }
  | { type: 'SELECT_AREA'; areaId: string }
  | { type: 'ADVANCE_TIME'; milliseconds: number }
  | { type: 'WITHDRAW' }
  | { type: 'STOP_AUTO_REPEAT' }
  | { type: 'SET_AUTO_REPEAT'; enabled: boolean }
  | { type: 'MARK_ITEM_REVIEWED'; itemId: string }
  | { type: 'SPEND_ATTRIBUTE'; attribute: Attribute }
  | { type: 'INVEST_SKILL'; skillId: string }
  | { type: 'RESPEC_SKILLS' }
  | { type: 'TOGGLE_ACTIVE_SKILL'; skillId: string }
  | { type: 'SELECT_AURA'; skillId: string | null }
  | { type: 'SELECT_ULTIMATE'; skillId: string | null }
  | { type: 'SET_TARGET_POLICY'; policy: TargetPolicy }
  | { type: 'SET_SKILL_TARGET_POLICY'; skillId: string; policy: TargetPolicy }
  | { type: 'SET_POTION_PREPARATION'; potion: PotionKind; size: PotionSize; thresholdPercent: number }
  | { type: 'SELECT_TIMED_BUFF'; buff: TimedBuffKind | null }
  | { type: 'EQUIP_ITEM'; itemId: string; equipmentSlot?: EquipmentPosition }
  | { type: 'SALVAGE_ITEM'; itemId: string };

export type SkillTree = 'physical' | 'tank' | 'magic' | 'general';
export type SkillKind = 'active' | 'passive' | 'aura' | 'ultimate' | 'mastery';
export type TargetPolicy = 'first' | 'last' | 'lowest-health' | 'highest-health' | 'boss-champion-first';
export type PotionKind = 'health' | 'mana';
export type PotionSize = 'Small' | 'Medium' | 'Large' | 'Greater';
export type TimedBuffKind = 'damage' | 'attack-speed' | 'health-regeneration' | 'mana-regeneration' | 'defense';
export type PotionStack = { kind: PotionKind; size: PotionSize; quantity: number };
export type PotionPreparation = { size: PotionSize; thresholdPercent: number } | null;
export type Consumables = { potions: PotionStack[]; timedBuffs: Record<TimedBuffKind, number> };

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
  passiveEffect?: { stat: 'attack' | 'maxHealth' | 'defense' | 'attackInterval' | 'maxMana' | 'healthRegeneration' | 'manaRegeneration'; valuePerRank: number };
  targetPolicy?: TargetPolicy;
};

export type Preparation = {
  activeSkillIds: string[];
  auraId: string | null;
  ultimateId: string | null;
  targetPolicy: TargetPolicy;
  skillTargetPolicies: Record<string, TargetPolicy>;
  potions: { health: PotionPreparation; mana: PotionPreparation };
  timedBuff: TimedBuffKind | null;
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
  potionCooldowns: Record<PotionKind, number>;
  potionUses: Partial<Record<PotionKind, number>>;
  timedBuff: { kind: TimedBuffKind; remainingMilliseconds: number } | null;
};

export type ExpeditionOutcome = {
  result: 'completed' | 'withdrawn' | 'defeated';
  areaName: string;
  roomReached: number;
  committed: { experience: number; currency: number };
  lost: { experience: number; currency: number };
  recoveryMilliseconds: number;
  willRestart: boolean;
  consumables: { potionsUsed: Partial<Record<PotionKind, number>>; timedBuff: TimedBuffKind | null };
};

export type GameState = {
  simulationVersion: string;
  seed: number;
  elapsedMilliseconds: number;
  status: ExpeditionStatus;
  areaName: string;
  selectedAreaId: string;
  areaProgress: Record<string, AreaCompletion>;
  roomIndex: number;
  roomCount: number;
  roomType: 'combat' | 'empty' | 'complete';
  hero: { name: string; health: number; maxHealth: number; attack: number; attackInterval: number };
  enemy: { name: string; health: number; maxHealth: number; champion?: boolean } | null;
  currency: number;
  committed: { experience: number; currency: number };
  recoveryRemainingMilliseconds: number;
  autoRepeat: boolean;
  outcome: ExpeditionOutcome | null;
  outcomeHistory: ExpeditionOutcome[];
  reviewedItemIds: string[];
  events: Event[];
  progression: ProgressionState;
  skills: SkillDefinition[];
  reviewQueue: string[];
  combat: CombatState;
  equipment: Equipment;
  inventory: Item[];
  nextItemId: number;
  consumables: Consumables;
};

export type SimulationScenario = {
  name: string;
  version: string;
  seed: number;
  durationMilliseconds: number;
  commands?: Command[];
  createGameOptions?: { startingHealth?: number; enemyAttack?: number };
};

export type SimulationResult = {
  scenario: string;
  version: string;
  seed: number;
  durationMilliseconds: number;
  outcome: ExpeditionOutcome | null;
  progression: Pick<ProgressionState, 'level' | 'experience' | 'attributePoints' | 'skillPoints'>;
  combat: Pick<CombatState, 'heroAttackProgress' | 'enemyAttackProgress' | 'heroMana' | 'maxMana' | 'heroManaRegeneration' | 'heroHealthRegeneration' | 'heroDefense' | 'potionUses'>;
  loot: { inventoryCount: number; itemIds: string[]; items: Array<Pick<Item, 'id' | 'slot' | 'quality' | 'exceptional'>>; currency: number; committedCurrency: number };
  state: GameState;
};

export type SimulationBatch = {
  results: SimulationResult[];
  report: BalanceReport;
};

export type OfflineSummary = {
  requestedMilliseconds: number;
  elapsedMilliseconds: number;
  completedRooms: number;
  outcomes: { completed: number; withdrawn: number; defeated: number };
  rewards: { experience: number; currency: number };
  lost: { experience: number; currency: number };
  outcomeDetails: ExpeditionOutcome[];
  recoveryEvents: number;
  capped: boolean;
  skippedMilliseconds: number;
};

export type OfflineAdvanceResult = { state: GameState; summary: OfflineSummary };

export type BalanceReport = {
  scenario: string;
  version: string;
  count: number;
  completed: number;
  withdrawn: number;
  defeated: number;
  incomplete: number;
  completionRate: number;
  averageDurationMilliseconds: number;
  averageCommittedExperience: number;
  averageCommittedCurrency: number;
  lootItemCount: number;
};

export type ContentValidationIssue = { code: string; message: string; path?: string };
export type ContentValidationResult = { valid: boolean; issues: ContentValidationIssue[] };
