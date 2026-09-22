import { FIRST_AREA } from './content';
import type { Command, Event, GameState } from './types';

const SIMULATION_VERSION = 'v1-foundation';
const HERO_ATTACK_INTERVAL = 1_000;
const ENEMY_ATTACK_INTERVAL = 1_500;

function event(message: string, id: number): Event { return { id, message }; }

export function createGame(seed = 1): GameState {
  const room = FIRST_AREA.rooms[0];
  return {
    simulationVersion: SIMULATION_VERSION,
    seed,
    elapsedMilliseconds: 0,
    status: 'preparation',
    areaName: FIRST_AREA.name,
    roomIndex: 0,
    roomCount: FIRST_AREA.rooms.length,
    roomType: room.type,
    hero: { name: 'Ari', health: 100, maxHealth: 100, attack: 8, attackInterval: HERO_ATTACK_INTERVAL },
    enemy: room.type === 'combat' ? { name: room.enemy.name, health: room.enemy.health, maxHealth: room.enemy.health } : null,
    committed: { experience: 0, currency: 0 },
    events: [event('A new Hero is ready in Sunlit Meadow.', 0)],
  };
}

function addEvent(state: GameState, message: string): GameState {
  const nextId = (state.events.at(-1)?.id ?? -1) + 1;
  return { ...state, events: [...state.events.slice(-5), event(message, nextId)] };
}

function enterRoom(state: GameState, roomIndex: number): GameState {
  const room = FIRST_AREA.rooms[roomIndex];
  if (!room) return { ...state, status: 'completed', roomType: 'complete', enemy: null };
  return {
    ...state,
    roomIndex,
    roomType: room.type,
    enemy: room.type === 'combat' ? { name: room.enemy.name, health: room.enemy.health, maxHealth: room.enemy.health } : null,
  };
}

function commitRoom(state: GameState): GameState {
  const room = FIRST_AREA.rooms[state.roomIndex];
  return {
    ...state,
    committed: { experience: state.committed.experience + room.experience, currency: state.committed.currency + room.currency },
  };
}

function advance(state: GameState, milliseconds: number): GameState {
  if (state.status !== 'active' || milliseconds <= 0) return state;
  let next = { ...state, elapsedMilliseconds: state.elapsedMilliseconds + milliseconds };
  const heroAttacks = Math.floor(next.elapsedMilliseconds / HERO_ATTACK_INTERVAL) - Math.floor((next.elapsedMilliseconds - milliseconds) / HERO_ATTACK_INTERVAL);
  const enemyAttacks = Math.floor(next.elapsedMilliseconds / ENEMY_ATTACK_INTERVAL) - Math.floor((next.elapsedMilliseconds - milliseconds) / ENEMY_ATTACK_INTERVAL);
  if (next.roomType === 'empty') {
    next = commitRoom(next);
    next = addEvent(next, 'The empty Room resolves and its rewards are committed.');
    next = enterRoom(next, next.roomIndex + 1);
  } else if (next.enemy) {
    const authoredRoom = FIRST_AREA.rooms[next.roomIndex];
    if (authoredRoom.type !== 'combat') return next;
    const enemyName = next.enemy.name;
    const enemy = { ...next.enemy, health: next.enemy.health - heroAttacks * next.hero.attack };
    next = { ...next, enemy, hero: { ...next.hero, health: next.hero.health - enemyAttacks * authoredRoom.enemy.attack } };
    if (enemy.health <= 0) {
      next = commitRoom(next);
      next = addEvent(next, `${enemyName} is defeated; Room rewards are committed.`);
      next = enterRoom(next, next.roomIndex + 1);
    } else if (next.hero.health <= 0) {
      next = { ...next, status: 'defeated' };
      next = addEvent(next, 'Ari was defeated before the Room completed.');
    }
  }
  if (next.roomType === 'complete') next = addEvent(next, 'Expedition completed. All Rooms are secured.');
  return next;
}

export function dispatch(state: GameState, command: Command): GameState {
  if (command.type === 'START_EXPEDITION' && state.status === 'preparation') {
    return addEvent({ ...state, status: 'active' }, 'Expedition started. Preparation is locked.');
  }
  if (command.type === 'ADVANCE_TIME') return advance(state, command.milliseconds);
  if (command.type === 'WITHDRAW' && state.status === 'active') return addEvent({ ...state, status: 'withdrawn' }, 'Expedition withdrawn; committed progress is retained.');
  return state;
}
