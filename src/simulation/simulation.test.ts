import { describe, expect, it } from 'vitest';
import { createGame, dispatch } from './simulation';

describe('deterministic simulation boundary', () => {
  it('starts a new Hero in Preparation and locks it when an Expedition starts', () => {
    const game = dispatch(createGame(42), { type: 'START_EXPEDITION' });
    expect(game.status).toBe('active');
    expect(game.hero.name).toBe('Ari');
    expect(game.events.at(-1)?.message).toContain('Preparation is locked');
  });

  it('replays the same controlled time and seed identically', () => {
    const run = () => {
      let game = dispatch(createGame(7), { type: 'START_EXPEDITION' });
      game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
      return dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
    };
    expect(run()).toEqual(run());
  });

  it('commits combat and empty Room rewards only as Rooms complete', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_000 });
    expect(game.roomIndex).toBe(0);
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
    expect(game.roomIndex).toBe(1);
    expect(game.committed).toEqual({ experience: 10, currency: 2 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1 });
    expect(game.roomIndex).toBe(2);
    expect(game.committed).toEqual({ experience: 15, currency: 3 });
  });

  it('completes the authored fixture and commits the final Room', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_000 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_000 });
    expect(game.status).toBe('completed');
    expect(game.roomType).toBe('complete');
    expect(game.committed).toEqual({ experience: 30, currency: 6 });
    expect(game.events.at(-1)?.message).toContain('Expedition completed');
  });
});
