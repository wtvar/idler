import { describe, expect, it } from 'vitest';
import { createGame, dispatch } from './simulation';
import { SAVE_VERSION, SaveStore, deserializeSave, serializeSave } from './save';

function memoryPersistence() {
  let value: string | null = null;
  return {
    read: () => value,
    write: (next: string) => { value = next; },
    value: () => value,
  };
}

describe('versioned SaveStore', () => {
  it('round-trips progression and an active Expedition without transient tick state', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 350 });
    const restored = deserializeSave(serializeSave(game));

    expect(restored.status).toBe('active');
    expect(restored.selectedAreaId).toBe(game.selectedAreaId);
    expect(restored.roomIndex).toBe(game.roomIndex);
    expect(restored.hero.health).toBe(game.hero.health);
    expect(restored.elapsedMilliseconds).toBe(0);
    expect(restored.enemy?.health).toBe(restored.enemy?.maxHealth);
    expect(restored.combat.pendingMilliseconds).toBe(0);
    expect(restored.combat.heroAttackProgress).toBe(0);
    expect(restored.combat.heroStatuses).toEqual([]);
    expect(restored.combat.timedBuff).toBeNull();
  });

  it('keeps the durable representation stable across animation ticks', () => {
    const started = dispatch(createGame(), { type: 'START_EXPEDITION' });
    expect(serializeSave(dispatch(started, { type: 'ADVANCE_TIME', milliseconds: 100 }))).toBe(serializeSave(started));
  });

  it('migrates a version 1 envelope and rejects future or malformed saves', () => {
    const game = createGame();
    const oldSave = JSON.stringify({ format: 'idler-save', version: 1, state: game });
    expect(deserializeSave(oldSave)).toMatchObject({ seed: game.seed, selectedAreaId: game.selectedAreaId });
    expect(() => deserializeSave(JSON.stringify({ format: 'idler-save', version: SAVE_VERSION + 1, state: game }))).toThrow(/newer/);
    expect(() => deserializeSave('{"format":"idler-save","version":2,"state":null}')).toThrow(/malformed/i);
  });

  it('rebuilds pending Item review decisions when loading an older save', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 300_000 });
    const { outcomeHistory: _outcomeHistory, reviewedItemIds: _reviewedItemIds, ...olderState } = game;
    const restored = deserializeSave(JSON.stringify({
      format: 'idler-save', version: 1, state: { ...olderState, reviewQueue: [] },
    }));

    expect(restored.inventory.length).toBeGreaterThan(0);
    expect(restored.reviewQueue.some((message) => message.startsWith('Item and Loot decision:'))).toBe(true);
  });

  it('does not replace the current state when import fails', () => {
    const persistence = memoryPersistence();
    const store = new SaveStore(persistence);
    const current = createGame(42);
    store.save(current);
    expect(() => store.import('{bad json')).toThrow();
    expect(store.load()?.seed).toBe(42);
    expect(persistence.value()).toContain('idler-save');
  });

  it('exports and imports valid saves through the persistence seam', () => {
    const persistence = memoryPersistence();
    const store = new SaveStore(persistence);
    const game = dispatch(createGame(), { type: 'SPEND_ATTRIBUTE', attribute: 'might' });
    const exported = store.export(game);
    expect(store.import(exported).seed).toBe(game.seed);
    expect(store.load()).toEqual(game);
  });

  it('advances an active saved Expedition by the time away when it returns', () => {
    const persistence = memoryPersistence();
    const store = new SaveStore(persistence);
    const started = dispatch(createGame(), { type: 'START_EXPEDITION' });
    store.save(started, 1_000);

    const loaded = store.loadWithOffline(5_500);

    expect(loaded?.summary.elapsedMilliseconds).toBe(4_500);
    expect(loaded?.summary.completedRooms).toBeGreaterThan(0);
    expect(loaded?.state.elapsedMilliseconds).toBe(4_500);
  });
});
