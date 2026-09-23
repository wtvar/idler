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

  it('produces the same state when controlled time is split at a tick boundary', () => {
    const start = dispatch(createGame(9), { type: 'START_EXPEDITION' });
    const split = dispatch(dispatch(start, { type: 'ADVANCE_TIME', milliseconds: 1 }), { type: 'ADVANCE_TIME', milliseconds: 99 });
    const whole = dispatch(start, { type: 'ADVANCE_TIME', milliseconds: 100 });
    expect(split).toEqual(whole);
  });

  it('commits combat and empty Room rewards only as Rooms complete', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_000 });
    expect(game.roomIndex).toBe(0);
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
    expect(game.roomIndex).toBe(1);
    expect(game.committed).toEqual({ experience: 10, currency: 2 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    expect(game.roomIndex).toBe(2);
    expect(game.committed).toEqual({ experience: 15, currency: 3 });
  });

  it('completes the authored fixture and commits the final Room', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_000 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_000 });
    expect(game.status).toBe('completed');
    expect(game.roomType).toBe('complete');
    expect(game.committed).toEqual({ experience: 30, currency: 6 });
    expect(game.events.at(-1)?.message).toContain('Expedition completed');
  });

  it('regenerates resources during Combat and applies the Empty Room effect', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });

    expect(game.combat.heroMana).toBeGreaterThan(20);
    expect(game.combat.heroMana).toBeLessThanOrEqual(game.combat.maxMana);

    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_000 });
    expect(game.roomType).toBe('empty');
    const healthBeforeEffect = game.hero.health;
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    expect(game.hero.health).toBeGreaterThanOrEqual(healthBeforeEffect);
    expect(game.events.at(-1)?.message).toContain('effect');
    expect(game.committed).toEqual({ experience: 15, currency: 3 });
  });

  it('uses mitigation and initiative ordering in a Combat tick', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_500 });

    expect(game.enemy?.health).toBe(10);
    expect(game.hero.health).toBe(99);
    expect(game.events.some(({ message }) => message.includes('mitigation'))).toBe(true);
  });

  it('withdraws after the current step and summarizes committed and lost progress', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });
    game = dispatch(game, { type: 'WITHDRAW' });

    expect(game.status).toBe('withdrawn');
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    expect(game.outcome).toMatchObject({ result: 'withdrawn', roomReached: 1, lost: { experience: 10, currency: 2 } });
    expect(game.events.at(-1)?.message).toContain('incomplete Room rewards were lost');
  });

  it('enters Recovery on defeat and automatically restarts the selected Area', () => {
    let game = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_500 });

    expect(game.status).toBe('recovery');
    expect(game.outcome).toMatchObject({ result: 'defeated', recoveryMilliseconds: 3_000, willRestart: true });
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_000 });
    expect(game.status).toBe('active');
    expect(game.roomIndex).toBe(0);
    expect(game.hero.health).toBe(100);
    expect(game.events.at(-1)?.message).toContain('restarts from Room 1');
  });

  it('stops automatic repeat during Recovery and waits until Recovery ends', () => {
    let game = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_500 });
    game = dispatch(game, { type: 'STOP_AUTO_REPEAT' });
    expect(game.status).toBe('recovery');
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_000 });
    expect(game.status).toBe('preparation');
    expect(game.events.at(-1)?.message).toContain('Automatic repeat is stopped');
  });

  it('uses Hero defeat when a tick leaves both actors at zero', () => {
    let game = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    game = { ...game, hero: { ...game.hero, health: 0 }, enemy: { name: 'Meadow Slime', health: 8, maxHealth: 18 } };
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_000 });
    expect(game.status).toBe('recovery');
    expect(game.outcome?.result).toBe('defeated');
  });
});
