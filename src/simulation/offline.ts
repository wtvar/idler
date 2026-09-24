import { dispatch } from './simulation';
import type { GameState, OfflineAdvanceResult, OfflineSummary } from './types';

export const MAX_OFFLINE_MILLISECONDS = 8 * 60 * 60 * 1_000;
const OFFLINE_STEP_MILLISECONDS = 100;

function emptySummary(requestedMilliseconds: number): OfflineSummary {
  return {
    requestedMilliseconds,
    elapsedMilliseconds: 0,
    completedRooms: 0,
    outcomes: { completed: 0, withdrawn: 0, defeated: 0 },
    rewards: { experience: 0, currency: 0 },
    lost: { experience: 0, currency: 0 },
    outcomeDetails: [],
    recoveryEvents: 0,
    capped: false,
    skippedMilliseconds: requestedMilliseconds,
  };
}

/** Advance saved active work in the same 100ms simulation steps as active play. */
export function advanceOffline(state: GameState, requestedMilliseconds: number): OfflineAdvanceResult {
  const requested = Number.isFinite(requestedMilliseconds) ? Math.max(0, requestedMilliseconds) : 0;
  const bounded = Math.min(requested, MAX_OFFLINE_MILLISECONDS);
  const summary = emptySummary(requested);
  summary.capped = bounded < requested;

  let current = state;
  let remaining = bounded;
  let lastEventId = current.events.at(-1)?.id ?? -1;
  while (remaining > 0 && (current.status === 'active' || current.status === 'recovery')) {
    const step = Math.min(OFFLINE_STEP_MILLISECONDS, remaining);
    const beforeStatus = current.status;
    const previousOutcome = current.outcomeHistory.at(-1);
    current = dispatch(current, { type: 'ADVANCE_TIME', milliseconds: step });
    const latestOutcome = current.outcomeHistory.at(-1);
    if (latestOutcome && latestOutcome !== previousOutcome) {
      const outcome = latestOutcome;
      summary.outcomeDetails.push(outcome);
      summary.rewards.experience += outcome.committed.experience;
      summary.rewards.currency += outcome.committed.currency;
      summary.lost.experience += outcome.lost.experience;
      summary.lost.currency += outcome.lost.currency;
      summary.outcomes[outcome.result] += 1;
      if (outcome.result === 'defeated') summary.recoveryEvents += 1;
    }
    summary.elapsedMilliseconds += step;
    remaining -= step;

    const newEvents = current.events.filter((event) => event.id > lastEventId);
    for (const event of newEvents) {
      if (event.message.includes('Room rewards are committed') || event.message.includes('its rewards are committed')) summary.completedRooms += 1;
    }
    if (newEvents.length > 0) lastEventId = newEvents.at(-1)?.id ?? lastEventId;
    if (beforeStatus === 'recovery' && current.status === 'preparation') break;
  }

  summary.skippedMilliseconds = requested - summary.elapsedMilliseconds;
  return { state: current, summary };
}
