import { expect, it } from 'vitest';
import { assertAuthoredContentValid } from './content-validation';
import { assertGoldenScenarios, assertScenarioDeterminism } from './runner';

it('accepts the complete authored Region and shared domain content', () => {
  expect(() => assertAuthoredContentValid()).not.toThrow();
});

it('replays named Simulation scenarios deterministically', () => {
  expect(() => assertGoldenScenarios()).not.toThrow();
  expect(() => assertScenarioDeterminism()).not.toThrow();
});
