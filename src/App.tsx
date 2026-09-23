import { useEffect, useState } from 'react';
import { createGame, dispatch, isSkillEligible } from './simulation/simulation';
import type { Command, GameState, SkillDefinition, SkillKind, TargetPolicy } from './simulation/types';
import './styles.css';

export function App() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const send = (command: Command) => setGame((current) => dispatch(current, command));
  const simulateFiveMinutes = () => setGame((current) => {
    const started = current.status === 'preparation' ? dispatch(current, { type: 'START_EXPEDITION' }) : current;
    return dispatch(started, { type: 'ADVANCE_TIME', milliseconds: 5 * 60 * 1_000 });
  });

  useEffect(() => {
    if (game.status !== 'active') return;
    const timer = window.setInterval(() => send({ type: 'ADVANCE_TIME', milliseconds: 100 }), 100);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const canStart = game.status === 'preparation' && game.progression.preparation.activeSkillIds.length === 4;
  const progress = game.roomType === 'complete' ? game.roomCount : game.roomIndex;
  const skillGroups: SkillKind[] = ['active', 'passive', 'aura', 'ultimate', 'mastery'];
  const skillButton = (skill: SkillDefinition) => {
    const rank = game.progression.skillRanks[skill.id] ?? 0;
    const eligible = isSkillEligible(game.progression, skill);
    const selected = game.progression.preparation.activeSkillIds.includes(skill.id) || game.progression.preparation.auraId === skill.id || game.progression.preparation.ultimateId === skill.id;
    if (skill.kind === 'active') return <div className="skill-row" key={skill.id}><span>{skill.name} <small>(active, rank {rank}/{skill.maxRank})</small></span><div className="skill-actions"><button className="secondary" onClick={() => send({ type: 'TOGGLE_ACTIVE_SKILL', skillId: skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0 || (!selected && game.progression.preparation.activeSkillIds.length >= 4)}>{selected ? 'Remove' : 'Select'} {skill.name} for Expedition</button><button className="secondary" onClick={() => send({ type: 'INVEST_SKILL', skillId: skill.id })} disabled={game.status !== 'preparation' || !eligible || game.progression.skillPoints === 0 || rank >= skill.maxRank}>Level up {skill.name}</button></div></div>;
    if (skill.kind === 'aura') return <button className="secondary" key={skill.id} onClick={() => send({ type: 'SELECT_AURA', skillId: selected ? null : skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0}>{game.progression.preparation.auraId === skill.id ? 'Remove' : 'Select'} Aura: {skill.name} <span>({rank}/{skill.maxRank})</span></button>;
    if (skill.kind === 'ultimate') return <button className="secondary" key={skill.id} onClick={() => send({ type: 'SELECT_ULTIMATE', skillId: selected ? null : skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0}>{game.progression.preparation.ultimateId === skill.id ? 'Remove' : 'Select'} Ultimate: {skill.name} <span>({rank}/{skill.maxRank})</span></button>;
    return <div className="skill-row" key={skill.id}><span>{skill.name} <small>({skill.kind}, rank {rank}/{skill.maxRank})</small></span>{rank < skill.maxRank && <button className="secondary" onClick={() => send({ type: 'INVEST_SKILL', skillId: skill.id })} disabled={game.status !== 'preparation' || !eligible || game.progression.skillPoints === 0}>Invest</button>}</div>;
  };
  const policies: TargetPolicy[] = ['first', 'last', 'lowest-health', 'highest-health', 'boss-champion-first'];
  return <main className="shell">
    <header><p className="eyebrow">IDLER · EXPEDITION DASHBOARD</p><h1>{game.areaName}</h1><p className="muted">A quiet place to prepare, then let the Hero work.</p></header>
    <section className="hero-card" aria-label="Hero status">
      <div><span className="label">HERO</span><h2>{game.hero.name}</h2><p>Level {game.progression.level} · {game.progression.experience} XP</p><p>Health {Math.ceil(game.hero.health)}/{game.hero.maxHealth}</p><p>Mana {Math.floor(game.combat.heroMana)}/{game.combat.maxMana}</p></div>
      <div className="health-bar"><span style={{ width: `${Math.max(0, game.hero.health / game.hero.maxHealth * 100)}%` }} /></div>
      <div className="status-pill" data-status={game.status}>{game.status}</div>
    </section>
    <section className="panel review" aria-label="Review queue">
      <span className="label">REVIEW QUEUE</span>
      {game.reviewQueue.length === 0 ? <p>Nothing needs review.</p> : game.reviewQueue.map((item) => <p key={item}>{item}</p>)}
      <p className="points">Attribute points: {game.progression.attributePoints} · Skill points: {game.progression.skillPoints}</p>
      <div className="attribute-controls" aria-label="Attribute decisions">
        {(['might', 'vitality', 'agility', 'focus'] as const).map((attribute) => <button key={attribute} className="secondary" onClick={() => send({ type: 'SPEND_ATTRIBUTE', attribute })} disabled={game.status !== 'preparation' || game.progression.attributePoints === 0}>Spend 1 {attribute[0].toUpperCase() + attribute.slice(1)} <span>({game.progression.attributes[attribute]})</span></button>)}
      </div>
    </section>
    <section className="panel preparation" aria-label="Preparation">
      <span className="label">PREPARATION</span>
      <h2>Build choices for the next Expedition</h2>
      <p className="muted">{game.status === 'active' ? 'Build changes are locked during the active Expedition.' : `${game.progression.preparation.activeSkillIds.length}/4 Active Skills selected · ${game.progression.preparation.auraId ? '1' : '0'}/1 Aura · ${game.progression.preparation.ultimateId ? '1' : '0'}/1 Ultimate`}</p>
      <div className="skill-controls">{skillGroups.map((kind) => <div key={kind}><span className="label">{kind}</span>{game.skills.filter((skill) => skill.kind === kind).map(skillButton)}</div>)}</div>
      <label className="target-policy">Target policy <select aria-label="Target policy" value={game.progression.preparation.targetPolicy} onChange={(event) => send({ type: 'SET_TARGET_POLICY', policy: event.target.value as TargetPolicy })} disabled={game.status !== 'preparation'}>{policies.map((policy) => <option key={policy} value={policy}>{policy}</option>)}</select></label>
      <button className="secondary" onClick={() => send({ type: 'RESPEC_SKILLS' })} disabled={game.status !== 'preparation'}>Free Respec</button>
    </section>
    <section className="grid">
      <article className="panel"><span className="label">EXPEDITION</span><h2>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}</h2><p>{game.roomType === 'combat' && game.enemy ? `${game.enemy.name}: ${Math.max(0, game.enemy.health)}/${game.enemy.maxHealth} health` : game.roomType === 'empty' ? 'Empty Room · resolving its effect' : 'Every Room is secured.'}</p><div className="room-track" aria-label={`Room ${progress} of ${game.roomCount}`}><span style={{ width: `${progress / game.roomCount * 100}%` }} /></div></article>
      <article className="panel"><span className="label">COMMITTED PROGRESS</span><h2>{game.committed.experience} XP</h2><p>{game.committed.currency} currency · retained at Room completion</p></article>
    </section>
    {game.roomType === 'combat' && game.enemy && <section className="panel combat-state" aria-label="Combat state"><span className="label">COMBAT STATE</span><p>Target policy: {game.combat.targetPolicy}</p><p>Next Hero attack: {Math.max(0, game.hero.attackInterval - game.combat.heroAttackProgress)} ms</p><p>Statuses: {game.combat.heroStatuses.length + game.combat.enemyStatuses.length || 'none'}</p></section>}
    {game.outcome && <section className="panel" aria-label="Expedition outcome"><span className="label">EXPEDITION OUTCOME</span><h2>{game.outcome.result}</h2><p>Room reached: {game.outcome.roomReached} · committed {game.outcome.committed.experience} XP and {game.outcome.committed.currency} currency</p><p>Lost from the incomplete Room: {game.outcome.lost.experience} XP and {game.outcome.lost.currency} currency.</p><p>{game.outcome.result === 'defeated' ? game.outcome.willRestart ? `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; the Area will restart automatically.` : `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; automatic repeat is stopped.` : 'No Recovery is required.'}</p></section>}
    <section className="controls" aria-label="Expedition commands"><button onClick={() => send({ type: 'START_EXPEDITION' })} disabled={!canStart}>Start Expedition</button><button className="secondary" onClick={() => send({ type: 'WITHDRAW' })} disabled={game.status !== 'active'}>Withdraw</button>{game.status === 'recovery' && <button className="secondary" onClick={() => send({ type: 'STOP_AUTO_REPEAT' })} disabled={!game.autoRepeat}>Stop automatic repeat</button>}<button className="secondary" onClick={simulateFiveMinutes}>Simulate 5 minutes</button><span className="muted">{game.status === 'active' ? 'The Hero is acting automatically.' : game.status === 'recovery' ? 'Recovery is advancing on the controlled clock.' : 'Choose Start Expedition when ready.'}</span></section>
    <section className="panel log"><span className="label">RECENT OUTCOMES</span>{game.events.slice().reverse().map((item) => <p key={item.id}>{item.message}</p>)}</section>
  </main>;
}
