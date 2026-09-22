export const FIRST_AREA = {
  name: 'Sunlit Meadow',
  rooms: [
    { type: 'combat' as const, enemy: { name: 'Meadow Slime', health: 18, attack: 2 }, experience: 10, currency: 2 },
    { type: 'empty' as const, experience: 5, currency: 1 },
    { type: 'combat' as const, enemy: { name: 'Thornback', health: 24, attack: 3 }, experience: 15, currency: 3 },
  ],
};
