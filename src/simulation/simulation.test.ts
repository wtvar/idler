import { describe, expect, it } from 'vitest';
import { ITEM_BASES, ITEM_QUALITY_MULTIPLIERS } from './content';
import { compareItem, createGame, dispatch, equipmentStats, generateItem, selectTarget } from './simulation';

describe('deterministic simulation boundary', () => {
  it('generates seeded, identified Items with compatible Affixes and authored Exceptional identity', () => {
    const exceptional = generateItem(7, 0, 0);
    const repeat = generateItem(7, 0, 0);
    const generated = generateItem(7, 1, 1);

    expect(exceptional).toEqual(repeat);
    expect(exceptional).toMatchObject({ name: 'Meadowguard Mail', slot: 'chest', exceptional: true, identified: true });
    expect(generated.id).not.toBe(exceptional.id);
    expect(generated.affixes.every((affix) => affix.slot === generated.slot)).toBe(true);
    expect(Object.keys(ITEM_QUALITY_MULTIPLIERS)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
    expect(Object.values(ITEM_BASES).map(({ slot }) => slot)).toEqual(expect.arrayContaining(['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring', 'amulet']));
    const generatedItems = Array.from({ length: 100 }, (_, seed) => generateItem(seed, 1, 1));
    expect(new Set(generatedItems.map((item) => item.quality))).toEqual(new Set(Object.keys(ITEM_QUALITY_MULTIPLIERS)));
    expect(new Set(generatedItems.map((item) => item.slot))).toEqual(new Set(Object.values(ITEM_BASES).map(({ slot }) => slot).filter((slot, index, slots) => slots.indexOf(slot) === index)));
    expect(generateItem(7, 1, 1).id).not.toBe(generateItem(7, 2, 1).id);
  });

  it('supports duplicate Items, comparison, and equipping between Expeditions', () => {
    let game = createGame(7);
    game = dispatch(game, { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_200 });
    expect(game.inventory).toHaveLength(1);
    const item = game.inventory[0];
    game = { ...game, status: 'preparation', inventory: [...game.inventory, { ...item, id: 'duplicate-item' }] };
    expect(game.inventory.map(({ id }) => id)).toEqual([item.id, 'duplicate-item']);
    expect(compareItem(item, game.equipment)).toEqual([]);
    game = dispatch(game, { type: 'EQUIP_ITEM', itemId: item.id });

    expect(game.equipment.chest?.id).toBe(item.id);
    expect(game.inventory).toHaveLength(1);
    expect(compareItem(game.inventory[0], game.equipment)).toEqual([item]);
    expect(equipmentStats(game.equipment).maxHealth).toBeGreaterThan(0);
  });

  it('applies equipment to the next Expedition but locks equipment during active Combat', () => {
    let game = createGame(7);
    game = dispatch(game, { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_200 });
    game = { ...game, status: 'preparation' };
    const item = game.inventory[0];
    game = dispatch(game, { type: 'EQUIP_ITEM', itemId: item.id });
    expect(game.hero.maxHealth).toBeGreaterThan(100);
    game = dispatch(game, { type: 'START_EXPEDITION' });
    const equippedState = game;
    expect(equippedState.combat.heroDefense).toBeGreaterThan(10);
    const activeWithLoot = { ...equippedState, inventory: [generateItem(7, 99, 1)] };
    const unchanged = dispatch(activeWithLoot, { type: 'EQUIP_ITEM', itemId: activeWithLoot.inventory[0].id });
    expect(unchanged.equipment).toEqual(activeWithLoot.equipment);
    expect(unchanged.combat).toEqual(activeWithLoot.combat);
    expect(unchanged.hero).toEqual(activeWithLoot.hero);
  });

  it('invests in eligible Skills, limits Preparation to four Active Skills, and changes Combat', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, level: 5, skillPoints: 1 } };
    game = dispatch(game, { type: 'INVEST_SKILL', skillId: 'physical-cleave' });
    expect(game.progression.skillRanks['physical-cleave']).toBe(1);

    for (const skillId of ['physical-strike', 'tank-guard', 'general-challenge', 'magic-bolt']) {
      game = dispatch(game, { type: 'TOGGLE_ACTIVE_SKILL', skillId });
    }
    game = dispatch(game, { type: 'TOGGLE_ACTIVE_SKILL', skillId: 'physical-cleave' });
    for (const skillId of ['tank-guard', 'general-challenge', 'magic-bolt']) {
      game = dispatch(game, { type: 'TOGGLE_ACTIVE_SKILL', skillId });
    }
    expect(game.progression.preparation.activeSkillIds).toEqual(['physical-cleave', 'tank-guard', 'general-challenge', 'magic-bolt']);
    game = dispatch(game, { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 1_400 });

    expect(game.combat.heroMana).toBeCloseTo(17.8);
    expect(game.enemy?.health).toBe(8);
    const cleaveEvent = game.events.find(({ message }) => message.includes('Cleave'));
    expect(cleaveEvent).toMatchObject({ timestampMilliseconds: 1_400 });
    expect(game.events.length).toBeGreaterThan(1);
  });

  it('rejects unavailable Skills and refunds invested ranks on free Preparation respec', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, level: 10, skillPoints: 2 } };
    game = dispatch(game, { type: 'INVEST_SKILL', skillId: 'magic-focus' });
    game = dispatch(game, { type: 'INVEST_SKILL', skillId: 'magic-aura' });
    expect(game.progression.skillRanks['magic-aura']).toBe(1);
    game = dispatch(game, { type: 'RESPEC_SKILLS' });

    expect(game.progression.skillPoints).toBe(2);
    expect(game.progression.skillRanks['magic-aura']).toBeUndefined();
    expect(dispatch(game, { type: 'INVEST_SKILL', skillId: 'general-mastery' })).toEqual(game);
  });

  it('locks Build changes during an active Expedition and applies deterministic target policy', () => {
    let game = dispatch(createGame(), { type: 'SET_TARGET_POLICY', policy: 'lowest-health' });
    expect(game.combat.targetPolicy).toBe('lowest-health');
    game = dispatch(game, { type: 'START_EXPEDITION' });
    expect(dispatch(game, { type: 'SET_TARGET_POLICY', policy: 'highest-health' })).toEqual(game);
    expect(dispatch(game, { type: 'RESPEC_SKILLS' })).toEqual(game);
  });

  it('selects stable targets and applies always-on passive progression', () => {
    expect(selectTarget([{ name: 'first', health: 20 }, { name: 'last', health: 5 }], 'lowest-health')?.name).toBe('last');
    let game = createGame();
    game = { ...game, progression: { ...game.progression, level: 10, skillPoints: 2 } };
    game = dispatch(game, { type: 'INVEST_SKILL', skillId: 'magic-focus' });
    game = dispatch(game, { type: 'INVEST_SKILL', skillId: 'tank-fortitude' });
    expect(game.combat.maxMana).toBe(32);
    expect(game.hero.maxHealth).toBe(103);
  });

  it('awards persistent XP only when a Room completes', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_200 });

    expect(game.progression.experience).toBe(10);
    expect(game.progression.level).toBe(1);

    game = dispatch(game, { type: 'WITHDRAW' });
    expect(game.progression.experience).toBe(10);
    expect(game.progression.experience).not.toBe(15);
  });

  it('levels up from committed Room XP and queues authored rewards', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, experience: 90 } };
    game = dispatch(game, { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_200 });

    expect(game.progression.level).toBe(2);
    expect(game.progression.attributePoints).toBe(2);
    expect(game.progression.skillPoints).toBe(1);
    expect(game.reviewQueue).toContain('Level 2 reached: 2 Attribute points and 1 Skill point available.');
    expect(game.reviewQueue).toContain('1 Skill point available to spend.');
  });

  it('caps progression and does not grant rewards beyond the authored cap', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, level: 100, experience: 9_999 } };
    game = dispatch(game, { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });

    expect(game.progression.level).toBe(100);
    expect(game.progression.attributePoints).toBe(0);
    expect(game.progression.skillPoints).toBe(0);
  });

  it('spends Attribute points between Expeditions and changes combat capabilities', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, attributePoints: 4 } };
    const before = game.hero;
    game = dispatch(game, { type: 'SPEND_ATTRIBUTE', attribute: 'might' });
    game = dispatch(game, { type: 'SPEND_ATTRIBUTE', attribute: 'vitality' });
    game = dispatch(game, { type: 'SPEND_ATTRIBUTE', attribute: 'agility' });
    game = dispatch(game, { type: 'SPEND_ATTRIBUTE', attribute: 'focus' });

    expect(game.progression.attributes).toEqual({ might: 1, vitality: 1, agility: 1, focus: 1 });
    expect(game.progression.attributePoints).toBe(0);
    expect(game.hero.attack).toBeGreaterThan(before.attack);
    expect(game.hero.maxHealth).toBeGreaterThan(before.maxHealth);
    expect(game.hero.attackInterval).toBeLessThan(before.attackInterval);
    expect(game.combat.maxMana).toBeGreaterThan(30);
    expect(game.combat.heroDefense).toBe(10.5);
    expect(game.combat.heroHealthRegeneration).toBeCloseTo(1.1);
    expect(game.combat.heroManaRegeneration).toBeCloseTo(2.2);
  });

  it('keeps pending progression visible in the Review queue during active Combat', () => {
    let game = createGame();
    game = { ...game, progression: { ...game.progression, attributePoints: 1 } };
    game = dispatch(game, { type: 'START_EXPEDITION' });

    expect(game.status).toBe('active');
    expect(game.reviewQueue).toContain('1 Attribute point available to spend.');
    expect(dispatch(game, { type: 'SPEND_ATTRIBUTE', attribute: 'might' })).toEqual(game);
  });

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
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 3_200 });
    expect(game.roomIndex).toBe(1);
    expect(game.committed).toEqual({ experience: 10, currency: 2 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    expect(game.roomIndex).toBe(2);
    expect(game.committed).toEqual({ experience: 15, currency: 3 });
  });

  it('completes the authored fixture and commits the final Room', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 4_200 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 100 });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 5_600 });
    expect(game.status).toBe('active');
    expect(game.roomIndex).toBe(0);
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    expect(game.outcome).toMatchObject({ result: 'completed', committed: { experience: 30, currency: 6 } });
    expect(game.events.some(({ message }) => message.includes('Expedition completed'))).toBe(true);
  });

  it('returns to Preparation after completion when automatic repeat is stopped', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'STOP_AUTO_REPEAT' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 9_900 });
    expect(game.status).toBe('preparation');
    expect(game.outcome?.result).toBe('completed');
    game = dispatch(game, { type: 'START_EXPEDITION' });
    expect(game.status).toBe('active');
  });

  it('regenerates resources during Combat and applies the Empty Room effect', () => {
    let game = dispatch(createGame(), { type: 'START_EXPEDITION' });
    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_000 });

    expect(game.combat.heroMana).toBeGreaterThan(20);
    expect(game.combat.heroMana).toBeLessThanOrEqual(game.combat.maxMana);

    game = dispatch(game, { type: 'ADVANCE_TIME', milliseconds: 2_200 });
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

    expect(game.status).toBe('preparation');
    expect(game.committed).toEqual({ experience: 0, currency: 0 });
    expect(game.outcome).toMatchObject({ result: 'withdrawn', roomReached: 1, lost: { experience: 10, currency: 2 } });
    expect(game.events.at(-1)?.message).toContain('incomplete Room rewards were lost');
    game = dispatch(game, { type: 'START_EXPEDITION' });
    expect(game.status).toBe('active');
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
