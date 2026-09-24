import { describe, expect, it } from 'vitest';
import { advanceOffline, MAX_OFFLINE_MILLISECONDS } from './offline';
import { createGame, dispatch } from './simulation';

describe('bounded offline advancement', () => {
  it('caps offline work at eight hours and reports skipped time', () => {
    const result = advanceOffline(createGame(), MAX_OFFLINE_MILLISECONDS + 1_000);

    expect(result.summary).toMatchObject({
      requestedMilliseconds: MAX_OFFLINE_MILLISECONDS + 1_000,
      elapsedMilliseconds: 0,
      capped: true,
      skippedMilliseconds: MAX_OFFLINE_MILLISECONDS + 1_000,
    });
    expect(result.state.status).toBe('preparation');
  });

  it('advances repeated Defeat, Recovery, and automatic restart cycles', () => {
    const started = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    const result = advanceOffline(started, 10_000);

    expect(result.summary.outcomes.defeated).toBe(2);
    expect(result.summary.recoveryEvents).toBe(2);
    expect(result.state.status).toBe('recovery');
    expect(result.state.roomIndex).toBe(0);
    expect(result.summary.outcomeDetails[0]).toMatchObject({
      result: 'defeated',
      recoveryMilliseconds: 3_000,
      willRestart: true,
    });
  });

  it('reports completed Rooms, outcomes, and committed rewards', () => {
    const started = dispatch(createGame(), { type: 'START_EXPEDITION' });
    const result = advanceOffline(started, 10_000);

    expect(result.summary.completedRooms).toBeGreaterThanOrEqual(3);
    expect(result.summary.outcomes.completed).toBeGreaterThanOrEqual(1);
    expect(result.summary.rewards).toEqual({ experience: 30, currency: 6 });
    expect(result.summary.outcomeDetails[0]).toMatchObject({
      result: 'completed',
      committed: { experience: 30, currency: 6 },
      lost: { experience: 0, currency: 0 },
      willRestart: true,
    });
  });

  it('matches active controlled-clock advancement in the same steps', () => {
    const started = dispatch(createGame(9), { type: 'START_EXPEDITION' });
    let active = started;
    for (let elapsed = 0; elapsed < 5_000; elapsed += 100) active = dispatch(active, { type: 'ADVANCE_TIME', milliseconds: 100 });

    const offline = advanceOffline(started, 5_000).state;
    expect(offline).toEqual(active);
  });

  it('honors a saved stop decision and reports time skipped after Recovery', () => {
    let stopped = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    stopped = dispatch(stopped, { type: 'ADVANCE_TIME', milliseconds: 1_500 });
    stopped = dispatch(stopped, { type: 'STOP_AUTO_REPEAT' });

    const result = advanceOffline(stopped, 5_000);

    expect(result.state.status).toBe('preparation');
    expect(result.summary.recoveryEvents).toBe(0);
    expect(result.summary.skippedMilliseconds).toBe(2_000);
  });
});
