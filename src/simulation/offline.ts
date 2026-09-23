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
    current = dispatch(current, { type: 'ADVANCE_TIME', milliseconds: step });
    summary.elapsedMilliseconds += step;
    remaining -= step;

    const newEvents = current.events.filter((event) => event.id > lastEventId);
    for (const event of newEvents) {
      if (event.message.includes('Room rewards are committed') || event.message.includes('its rewards are committed')) summary.completedRooms += 1;
      if (event.message.includes('Expedition completed')) {
        summary.outcomes.completed += 1;
        summary.rewards.experience += current.outcome?.committed.experience ?? 0;
        summary.rewards.currency += current.outcome?.committed.currency ?? 0;
      }
      if (event.message.includes('Expedition withdrawn')) {
        summary.outcomes.withdrawn += 1;
        summary.rewards.experience += current.outcome?.committed.experience ?? 0;
        summary.rewards.currency += current.outcome?.committed.currency ?? 0;
      }
      if (event.message.includes('Ari was defeated')) {
        summary.outcomes.defeated += 1;
        summary.rewards.experience += current.outcome?.committed.experience ?? 0;
        summary.rewards.currency += current.outcome?.committed.currency ?? 0;
        summary.recoveryEvents += 1;
      }
    }
    if (newEvents.length > 0) lastEventId = newEvents.at(-1)?.id ?? lastEventId;
    if (beforeStatus === 'recovery' && current.status === 'preparation') break;
  }

  summary.skippedMilliseconds = requested - summary.elapsedMilliseconds;
  return { state: current, summary };
}
