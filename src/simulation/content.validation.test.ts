import { expect, it } from 'vitest';
import { AREAS, SKILLS } from './content';
import { assertAuthoredContentValid } from './content-validation';
import { assertGoldenScenarios, assertScenarioDeterminism } from './runner';

it('accepts the complete authored Region and shared domain content', () => {
  expect(() => assertAuthoredContentValid()).not.toThrow();
});

it('keeps every Area within the authored 10–20 Room range and each Build tree complete', () => {
  expect(AREAS).toHaveLength(25);
  expect(AREAS.every(({ rooms }) => rooms.length >= 10 && rooms.length <= 20)).toBe(true);
  const championChances = AREAS.filter(({ kind }) => kind === 'ordinary').flatMap(({ rooms }) => rooms.flatMap((room) => room.type === 'combat' && (room.championChance ?? 0) > 0 ? [room.championChance!] : []));
  expect(championChances.every((chance) => chance >= 0.05 && chance <= 0.1)).toBe(true);
  for (const tree of ['physical', 'tank', 'magic']) {
    expect(SKILLS.filter((skill) => skill.tree === tree && skill.kind === 'active')).toHaveLength(10);
    expect(SKILLS.filter((skill) => skill.tree === tree && skill.kind === 'passive')).toHaveLength(5);
    expect(SKILLS.filter((skill) => skill.tree === tree && skill.kind === 'ultimate')).toHaveLength(2);
    expect(SKILLS.filter((skill) => skill.tree === tree && skill.kind === 'mastery')).toMatchObject([{ unlockLevel: 30, maxRank: 1 }]);
    expect(SKILLS.filter((skill) => skill.tree === tree && skill.id.includes('-passive-')).every(({ passiveEffect }) => passiveEffect !== undefined)).toBe(true);
  }
});

it('replays named Simulation scenarios deterministically', () => {
  expect(() => assertGoldenScenarios()).not.toThrow();
  expect(() => assertScenarioDeterminism()).not.toThrow();
});
