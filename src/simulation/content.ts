import type { SkillDefinition } from './types';

export const FIRST_AREA = {
  name: 'Sunlit Meadow',
  rooms: [
    { type: 'combat' as const, enemy: { name: 'Meadow Slime', health: 18, attack: 2 }, experience: 10, currency: 2 },
    { type: 'empty' as const, durationMilliseconds: 100, healthEffect: 8, manaEffect: 4, experience: 5, currency: 1 },
    { type: 'combat' as const, enemy: { name: 'Thornback', health: 24, attack: 3, defense: 10 }, experience: 15, currency: 3 },
  ],
};

export const SKILLS: SkillDefinition[] = [
  { id: 'physical-strike', name: 'Measured Strike', tree: 'physical', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A reliable weapon attack.', damageMultiplier: 1 },
  { id: 'physical-cleave', name: 'Cleave', tree: 'physical', kind: 'active', unlockLevel: 5, prerequisites: ['physical-strike'], maxRank: 20, manaCost: 5, cooldownMilliseconds: 2_000, description: 'A heavier attack against the current target.', damageMultiplier: 1.3 },
  { id: 'physical-tempo', name: 'Battle Tempo', tree: 'physical', kind: 'passive', unlockLevel: 10, prerequisites: ['physical-strike'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve the Hero attack interval.' },
  { id: 'physical-ultimate', name: 'Execution', tree: 'physical', kind: 'ultimate', unlockLevel: 20, prerequisites: ['physical-cleave'], maxRank: 5, manaCost: 15, cooldownMilliseconds: 10_000, description: 'A decisive physical attack.', damageMultiplier: 2 },
  { id: 'tank-guard', name: 'Guard', tree: 'tank', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A guarded attack that improves survivability.', damageMultiplier: 1 },
  { id: 'tank-reprisal', name: 'Reprisal', tree: 'tank', kind: 'active', unlockLevel: 5, prerequisites: ['tank-guard'], maxRank: 20, manaCost: 5, cooldownMilliseconds: 3_000, description: 'A defensive counterattack.', damageMultiplier: 1.2 },
  { id: 'tank-fortitude', name: 'Fortitude', tree: 'tank', kind: 'passive', unlockLevel: 10, prerequisites: ['tank-guard'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve maximum Health.' },
  { id: 'tank-ultimate', name: 'Last Stand', tree: 'tank', kind: 'ultimate', unlockLevel: 20, prerequisites: ['tank-reprisal'], maxRank: 5, manaCost: 15, cooldownMilliseconds: 10_000, description: 'A powerful attack born from defence.', damageMultiplier: 1.8 },
  { id: 'magic-bolt', name: 'Arcane Bolt', tree: 'magic', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 5, cooldownMilliseconds: 1_000, description: 'A Mana-powered attack.', damageMultiplier: 1.4 },
  { id: 'magic-focus', name: 'Focused Mind', tree: 'magic', kind: 'passive', unlockLevel: 10, prerequisites: ['magic-bolt'], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve maximum Mana.' },
  { id: 'magic-aura', name: 'Arcane Aura', tree: 'magic', kind: 'aura', unlockLevel: 10, prerequisites: ['magic-bolt'], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'The selected Aura improves Mana regeneration.' },
  { id: 'magic-ultimate', name: 'Meteor', tree: 'magic', kind: 'ultimate', unlockLevel: 20, prerequisites: ['magic-bolt'], maxRank: 5, manaCost: 20, cooldownMilliseconds: 12_000, description: 'A devastating arcane attack.', damageMultiplier: 2.2 },
  { id: 'general-quickness', name: 'Quickness', tree: 'general', kind: 'passive', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'Ranks improve attack speed.' },
  { id: 'general-challenge', name: 'Challenge', tree: 'general', kind: 'active', unlockLevel: 1, prerequisites: [], maxRank: 20, manaCost: 0, cooldownMilliseconds: 0, description: 'A dependable opening attack.', damageMultiplier: 1 },
  { id: 'general-focus', name: 'Battle Focus', tree: 'general', kind: 'aura', unlockLevel: 1, prerequisites: [], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'The selected Aura improves Health and Mana regeneration.' },
  { id: 'general-mastery', name: 'Adaptive Mastery', tree: 'general', kind: 'mastery', unlockLevel: 30, prerequisites: ['general-quickness'], maxRank: 1, manaCost: 0, cooldownMilliseconds: 0, description: 'A late Build specialisation.' },
];
