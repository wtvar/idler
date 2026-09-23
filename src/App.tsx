import { useEffect, useState } from 'react';
import { compareItem, createGame, dispatch, isSkillEligible, itemStats } from './simulation/simulation';
import type { Command, EquipmentPosition, GameState, Item, SkillDefinition, SkillKind, TargetPolicy } from './simulation/types';
import './styles.css';

function formatEventTime(timestampMilliseconds: number): string {
  const totalSeconds = Math.floor(timestampMilliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const tenths = Math.floor(timestampMilliseconds % 1_000 / 100);
  return `${minutes}:${seconds}.${tenths}`;
}

export function App() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);
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
  const inspectedItem = game.inventory.find((item) => item.id === inspectedItemId) ?? game.inventory[0];
  const itemLabel = (item: Item) => `${item.name} · ${item.slot}${item.exceptional ? ' · Exceptional' : ''}`;
  const statsLabel = (item: Item) => Object.entries(itemStats(item)).filter(([, value]) => value !== 0).map(([stat, value]) => `${stat} ${value > 0 ? '+' : ''}${value}`).join(' · ');
  const comparisonLabel = (item: Item, equipped: Item) => Object.keys(itemStats(item)).map((stat) => {
    const difference = itemStats(item)[stat as keyof ReturnType<typeof itemStats>] - itemStats(equipped)[stat as keyof ReturnType<typeof itemStats>];
    return difference === 0 ? null : `${stat} ${difference > 0 ? '+' : ''}${difference}`;
  }).filter((value): value is string => value !== null).join(' · ') || 'no change';
  const equipButton = (item: Item, equipmentSlot?: EquipmentPosition) => <button className="secondary" onClick={() => send({ type: 'EQUIP_ITEM', itemId: item.id, equipmentSlot })} disabled={game.status !== 'preparation'}>{item.slot === 'ring' ? `Equip ${equipmentSlot ?? 'ring'}` : 'Equip'}</button>;
  return <main className="shell">
    <header><p className="eyebrow">IDLER · EXPEDITION DASHBOARD</p><h1>{game.areaName}</h1><p className="muted">A quiet place to prepare, then let the Hero work.</p></header>
    <section className="hero-card" aria-label="Hero status">
      <div><span className="label">HERO</span><h2>{game.hero.name}</h2><p>Level {game.progression.level} · {game.progression.experience} XP</p><p>Health {Math.ceil(game.hero.health)}/{game.hero.maxHealth}</p><p>Mana {Math.floor(game.combat.heroMana)}/{game.combat.maxMana}</p><p>Build: {game.hero.attack} Attack · {game.combat.heroDefense} Defense · {Math.round(game.hero.attackInterval)} ms interval</p></div>
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
    <section className="panel equipment" aria-label="Equipment and Loot">
      <span className="label">EQUIPMENT &amp; LOOT</span>
      <h2>Build equipment</h2>
      <div className="equipment-slots">{(['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring1', 'ring2', 'amulet'] as const).map((slot) => <p key={slot}><strong>{slot}</strong>: {game.equipment[slot]?.name ?? 'empty'}</p>)}</div>
      {inspectedItem ? <div className="item-inspector" aria-label="Item inspection"><h3>{itemLabel(inspectedItem)}</h3><p>{inspectedItem.quality} · Immediately identified</p><p>{statsLabel(inspectedItem) || 'No base stats'}{inspectedItem.affixes.length > 0 ? ` · ${inspectedItem.affixes.map((affix) => `${affix.name} ${affix.value}`).join(' · ')}` : ''}</p><p>Compared with: {compareItem(inspectedItem, game.equipment).map((item) => `${item.name} (${comparisonLabel(inspectedItem, item)})`).join(', ') || 'nothing equipped'}</p><div className="item-actions">{equipButton(inspectedItem)}{inspectedItem.slot === 'ring' && <>{equipButton(inspectedItem, 'ring1')}{equipButton(inspectedItem, 'ring2')}</>}</div></div> : <p>No Items yet. Complete a Room to find one.</p>}
      <div className="inventory" aria-label="Inventory">{game.inventory.map((item) => <button className="secondary" key={item.id} onClick={() => setInspectedItemId(item.id)}>{itemLabel(item)}</button>)}</div>
    </section>
    <section className="grid">
      <article className="panel"><span className="label">EXPEDITION</span><h2>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}</h2><p>{game.roomType === 'combat' && game.enemy ? `${game.enemy.name}: ${Math.max(0, game.enemy.health)}/${game.enemy.maxHealth} health` : game.roomType === 'empty' ? 'Empty Room · resolving its effect' : 'Every Room is secured.'}</p><div className="room-track" aria-label={`Room ${progress} of ${game.roomCount}`}><span style={{ width: `${progress / game.roomCount * 100}%` }} /></div></article>
      <article className="panel"><span className="label">COMMITTED PROGRESS</span><h2>{game.committed.experience} XP</h2><p>{game.committed.currency} currency · retained at Room completion</p></article>
    </section>
    {game.roomType === 'combat' && game.enemy && <section className="panel combat-state" aria-label="Combat state"><span className="label">COMBAT STATE</span><p>Target policy: {game.combat.targetPolicy}</p><p>Next Hero attack: {Math.max(0, game.hero.attackInterval - game.combat.heroAttackProgress)} ms</p><p>Statuses: {game.combat.heroStatuses.length + game.combat.enemyStatuses.length || 'none'}</p></section>}
    {game.outcome && <section className="panel" aria-label="Expedition outcome"><span className="label">EXPEDITION OUTCOME</span><h2>{game.outcome.result}</h2><p>Room reached: {game.outcome.roomReached} · committed {game.outcome.committed.experience} XP and {game.outcome.committed.currency} currency</p><p>Lost from the incomplete Room: {game.outcome.lost.experience} XP and {game.outcome.lost.currency} currency.</p><p>{game.outcome.result === 'defeated' ? game.outcome.willRestart ? `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; the Area will restart automatically.` : `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; automatic repeat is stopped.` : 'No Recovery is required.'}</p></section>}
    <section className="controls" aria-label="Expedition commands"><button onClick={() => send({ type: 'START_EXPEDITION' })} disabled={!canStart}>Start Expedition</button><button className="secondary" onClick={() => send({ type: 'WITHDRAW' })} disabled={game.status !== 'active'}>Withdraw</button>{game.status === 'recovery' && <button className="secondary" onClick={() => send({ type: 'STOP_AUTO_REPEAT' })} disabled={!game.autoRepeat}>Stop automatic repeat</button>}<button className="secondary" onClick={simulateFiveMinutes}>Simulate 5 minutes</button><span className="muted">{game.status === 'active' ? 'The Hero is acting automatically.' : game.status === 'recovery' ? 'Recovery is advancing on the controlled clock.' : 'Choose Start Expedition when ready.'}</span></section>
    <section className="panel log" aria-label="Recent outcomes"><span className="label">RECENT OUTCOMES</span><div className="log-entries">{game.events.slice().reverse().map((item) => <p key={item.id}><time dateTime={`PT${item.timestampMilliseconds / 1_000}S`}>{formatEventTime(item.timestampMilliseconds)}</time><span>{item.message}</span></p>)}</div></section>
  </main>;
}
