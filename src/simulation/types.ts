export type ExpeditionStatus = 'preparation' | 'active' | 'completed' | 'withdrawn' | 'defeated' | 'recovery';

export type Command =
  | { type: 'START_EXPEDITION' }
  | { type: 'ADVANCE_TIME'; milliseconds: number }
  | { type: 'WITHDRAW' }
  | { type: 'STOP_AUTO_REPEAT' };

export type Event = { id: number; message: string };

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
  targetPolicy: 'first';
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
  committed: { experience: number; currency: number };
  recoveryRemainingMilliseconds: number;
  autoRepeat: boolean;
  outcome: ExpeditionOutcome | null;
  events: Event[];
  combat: CombatState;
};
