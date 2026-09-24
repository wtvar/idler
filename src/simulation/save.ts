import { createGame, synchronizeReviewQueue } from './simulation';
import { advanceOffline } from './offline';
import type { GameState, OfflineAdvanceResult } from './types';

export const SAVE_VERSION = 2;
export const SAVE_FORMAT = 'idler-save';
export const SAVE_STORAGE_KEY = 'idler.save';

type SaveEnvelope = { format: typeof SAVE_FORMAT; version: number; state: GameState; savedAtMilliseconds?: number };

export interface SavePersistence {
  read(): string | null;
  write(value: string): void;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function transientSafeState(state: GameState): GameState {
  const activeCombat = state.status === 'active'
    ? {
      hero: { ...state.hero, health: state.hero.maxHealth },
      enemy: state.enemy ? { ...state.enemy, health: state.enemy.maxHealth } : null,
      combat: { heroMana: state.combat.maxMana },
    }
    : { hero: state.hero, enemy: state.enemy, combat: { heroMana: state.combat.heroMana } };
  return {
    ...state,
    elapsedMilliseconds: 0,
    events: state.events.filter(({ message }) => !message.includes(' attacks ') && !message.includes(' uses a ')),
    hero: activeCombat.hero,
    enemy: activeCombat.enemy,
    combat: {
      ...state.combat,
      heroMana: activeCombat.combat.heroMana,
      pendingMilliseconds: 0,
      heroAttackProgress: 0,
      enemyAttackProgress: 0,
      heroCooldowns: {},
      heroStatuses: [],
      enemyStatuses: [],
      potionCooldowns: { health: 0, mana: 0 },
      potionUses: {},
      timedBuff: null,
    },
  };
}

function migrate(value: unknown): SaveEnvelope {
  if (!isRecord(value) || value.format !== SAVE_FORMAT || typeof value.version !== 'number' || !isRecord(value.state)) {
    throw new SaveError('Save is malformed or has an unsupported format.');
  }
  if (value.version > SAVE_VERSION) throw new SaveError('Save was created by a newer version of Idler.');
  if (value.version < 1) throw new SaveError('Save version is unsupported.');

  // Version 1 used the complete GameState as its payload. Keeping this migration
  // explicit means future schema changes do not silently reinterpret old saves.
  const state = value.state;
  const validStatuses = ['preparation', 'active', 'completed', 'withdrawn', 'defeated', 'recovery'];
  if (!Number.isFinite(state.seed) || typeof state.selectedAreaId !== 'string' || typeof state.status !== 'string' || !validStatuses.includes(state.status)
    || !isRecord(state.hero) || !isRecord(state.progression) || !isRecord(state.combat)
    || !Array.isArray(state.inventory) || !isRecord(state.equipment) || !isRecord(state.consumables)) {
    throw new SaveError('Save state is invalid.');
  }
  const defaults = createGame(state.seed as number);
  const migratedState = {
    ...defaults,
    ...state,
    events: Array.isArray(state.events) ? state.events : defaults.events,
    outcome: isRecord(state.outcome) ? { ...state.outcome, areaName: typeof state.outcome.areaName === 'string' ? state.outcome.areaName : state.areaName } : null,
    outcomeHistory: Array.isArray(state.outcomeHistory)
      ? state.outcomeHistory.map((outcome) => isRecord(outcome) ? { ...outcome, areaName: typeof outcome.areaName === 'string' ? outcome.areaName : state.areaName } : outcome)
      : isRecord(state.outcome) ? [{ ...state.outcome, areaName: state.areaName }] : defaults.outcomeHistory,
    reviewedItemIds: Array.isArray(state.reviewedItemIds) ? state.reviewedItemIds : defaults.reviewedItemIds,
    hero: { ...defaults.hero, ...(state.hero as object) },
    combat: { ...defaults.combat, ...(state.combat as object) },
    progression: {
      ...defaults.progression,
      ...(state.progression as object),
      preparation: { ...defaults.progression.preparation, ...((state.progression as { preparation?: object }).preparation ?? {}) },
    },
  } as GameState;
  return { format: SAVE_FORMAT, version: SAVE_VERSION, state: transientSafeState(synchronizeReviewQueue(migratedState)) };
}

export function serializeSave(state: GameState, savedAtMilliseconds = 0): string {
  const envelope: SaveEnvelope = { format: SAVE_FORMAT, version: SAVE_VERSION, state: transientSafeState(state) };
  if (savedAtMilliseconds > 0) envelope.savedAtMilliseconds = savedAtMilliseconds;
  return JSON.stringify(envelope);
}

export function deserializeSave(raw: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SaveError('Save is not valid JSON.');
  }
  const envelope = migrate(parsed);
  // Older saves may omit fields added after their release. Defaults make that
  // migration safe while the basic envelope validation rejects arbitrary data.
  return envelope.state;
}

export class SaveStore {
  constructor(private readonly persistence: SavePersistence) {}

  load(): GameState | null {
    const raw = this.persistence.read();
    return raw === null ? null : deserializeSave(raw);
  }

  loadWithOffline(nowMilliseconds = Date.now()): OfflineAdvanceResult | null {
    const raw = this.persistence.read();
    if (raw === null) return null;
    const state = deserializeSave(raw);
    let savedAt: unknown;
    try { savedAt = (JSON.parse(raw) as { savedAtMilliseconds?: unknown }).savedAtMilliseconds; } catch { savedAt = undefined; }
    const elapsed = typeof savedAt === 'number' && Number.isFinite(savedAt) ? Math.max(0, nowMilliseconds - savedAt) : 0;
    return advanceOffline(state, elapsed);
  }

  save(state: GameState, savedAtMilliseconds = Date.now()): void {
    this.persistence.write(serializeSave(state, savedAtMilliseconds));
  }

  export(state: GameState): string {
    return serializeSave(state);
  }

  import(raw: string): GameState {
    const imported = deserializeSave(raw);
    this.save(imported);
    return imported;
  }
}

export function browserSavePersistence(storage: Storage = window.localStorage): SavePersistence {
  return { read: () => storage.getItem(SAVE_STORAGE_KEY), write: (value) => storage.setItem(SAVE_STORAGE_KEY, value) };
}
