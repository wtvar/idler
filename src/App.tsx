import { useEffect, useState } from 'react';
import { createGame, dispatch } from './simulation/simulation';
import type { Command, GameState } from './simulation/types';
import './styles.css';

export function App() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const send = (command: Command) => setGame((current) => dispatch(current, command));

  useEffect(() => {
    if (game.status !== 'active') return;
    const timer = window.setInterval(() => send({ type: 'ADVANCE_TIME', milliseconds: 100 }), 100);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const canStart = game.status === 'preparation';
  const progress = game.roomType === 'complete' ? game.roomCount : game.roomIndex;
  return <main className="shell">
    <header><p className="eyebrow">IDLER · EXPEDITION DASHBOARD</p><h1>{game.areaName}</h1><p className="muted">A quiet place to prepare, then let the Hero work.</p></header>
    <section className="hero-card" aria-label="Hero status">
      <div><span className="label">HERO</span><h2>{game.hero.name}</h2><p>Health {Math.ceil(game.hero.health)}/{game.hero.maxHealth}</p><p>Mana {Math.floor(game.combat.heroMana)}/{game.combat.maxMana}</p></div>
      <div className="health-bar"><span style={{ width: `${Math.max(0, game.hero.health / game.hero.maxHealth * 100)}%` }} /></div>
      <div className="status-pill" data-status={game.status}>{game.status}</div>
    </section>
    <section className="grid">
      <article className="panel"><span className="label">EXPEDITION</span><h2>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}</h2><p>{game.roomType === 'combat' && game.enemy ? `${game.enemy.name}: ${Math.max(0, game.enemy.health)}/${game.enemy.maxHealth} health` : game.roomType === 'empty' ? 'Empty Room · resolving its effect' : 'Every Room is secured.'}</p><div className="room-track" aria-label={`Room ${progress} of ${game.roomCount}`}><span style={{ width: `${progress / game.roomCount * 100}%` }} /></div></article>
      <article className="panel"><span className="label">COMMITTED PROGRESS</span><h2>{game.committed.experience} XP</h2><p>{game.committed.currency} currency · retained at Room completion</p></article>
    </section>
    {game.roomType === 'combat' && game.enemy && <section className="panel combat-state" aria-label="Combat state"><span className="label">COMBAT STATE</span><p>Target policy: {game.combat.targetPolicy}</p><p>Next Hero attack: {Math.max(0, game.hero.attackInterval - game.combat.heroAttackProgress)} ms</p><p>Statuses: {game.combat.heroStatuses.length + game.combat.enemyStatuses.length || 'none'}</p></section>}
    <section className="controls" aria-label="Expedition commands"><button onClick={() => send({ type: 'START_EXPEDITION' })} disabled={!canStart}>Start Expedition</button><button className="secondary" onClick={() => send({ type: 'WITHDRAW' })} disabled={game.status !== 'active'}>Withdraw</button><span className="muted">{game.status === 'active' ? 'The Hero is acting automatically.' : 'Choose Start Expedition when ready.'}</span></section>
    <section className="panel log"><span className="label">RECENT OUTCOMES</span>{game.events.slice().reverse().map((item) => <p key={item.id}>{item.message}</p>)}</section>
  </main>;
}
