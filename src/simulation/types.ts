export type ExpeditionStatus = 'preparation' | 'active' | 'completed' | 'withdrawn' | 'defeated';

export type Command =
  | { type: 'START_EXPEDITION' }
  | { type: 'ADVANCE_TIME'; milliseconds: number }
  | { type: 'WITHDRAW' };

export type Event = { id: number; message: string };

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
  events: Event[];
};
