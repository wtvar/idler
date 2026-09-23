import { useEffect, useRef, useState } from 'react';
import { availableInventorySpace, compareItem, createGame, dispatch, getAreaMap, inventoryCapacity, isSkillEligible, itemStats } from './simulation/simulation';
import { browserSavePersistence, SaveError, SaveStore, serializeSave } from './simulation/save';
import type { Command, EquipmentPosition, GameState, Item, SkillDefinition, TargetPolicy } from './simulation/types';
import './styles.css';

function formatEventTime(timestampMilliseconds: number): string {
  const totalSeconds = Math.floor(timestampMilliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const tenths = Math.floor(timestampMilliseconds % 1_000 / 100);
  return `${minutes}:${seconds}.${tenths}`;
}

export function App() {
  const saveStore = useRef(new SaveStore(browserSavePersistence())).current;
  const [game, setGame] = useState<GameState>(() => {
    try { return saveStore.load() ?? createGame(); } catch { return createGame(); }
  });
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);
  const [saveText, setSaveText] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [page, setPage] = useState<'expedition' | 'skills'>('expedition');
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

  const durableSave = serializeSave(game);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (durableSave === lastSaved.current) return;
    saveStore.save(game);
    lastSaved.current = durableSave;
  }, [durableSave, game, saveStore]);

  const exportSave = () => {
    setSaveText(saveStore.export(game));
    setSaveMessage('Save exported. Copy the text to keep a developer backup.');
  };

  const importSave = () => {
    try {
      setGame(saveStore.import(saveText));
      setSaveMessage('Save imported successfully.');
    } catch (error) {
      setSaveMessage(error instanceof SaveError ? error.message : 'Save could not be imported.');
    }
  };

  const canStart = game.status === 'preparation' && game.progression.preparation.activeSkillIds.length === 4;
  const progress = game.roomType === 'complete' ? game.roomCount : game.roomIndex;
  const expeditionRisk = game.status === 'recovery' ? 'Recovery' : game.status === 'active' && game.hero.health / game.hero.maxHealth < .35 ? 'High' : game.status === 'active' ? 'Watching' : 'Ready';
  const heroCombatState = game.status === 'active' && game.roomType === 'combat' ? 'In Combat' : game.status === 'recovery' ? 'Recovering' : 'Preparing';
  const skillTrees = ['physical', 'tank', 'magic', 'general'] as const;
  const skillButton = (skill: SkillDefinition) => {
    const rank = game.progression.skillRanks[skill.id] ?? 0;
    const eligible = isSkillEligible(game.progression, skill);
    const selected = game.progression.preparation.activeSkillIds.includes(skill.id) || game.progression.preparation.auraId === skill.id || game.progression.preparation.ultimateId === skill.id;
    const prerequisiteNames = skill.prerequisites.map((id) => game.skills.find((candidate) => candidate.id === id)?.name ?? id);
    return <article className={`skill-node ${eligible ? '' : 'skill-node-locked'}`} key={skill.id}>
      <div className="skill-node-heading"><div><h3>{skill.name}</h3><span className="skill-kind">{skill.kind} · rank {rank}/{skill.maxRank}</span></div><span className="skill-level">Level {skill.unlockLevel}+</span></div>
      <p>{skill.description}</p>
      <p className="skill-requirements">{prerequisiteNames.length > 0 ? `Requires: ${prerequisiteNames.join(', ')}` : 'Starting Skill'}{!eligible && game.progression.level < skill.unlockLevel ? ` · Unlocks at Hero level ${skill.unlockLevel}` : ''}</p>
      <div className="skill-actions">
        {skill.kind === 'active' && <button className="secondary" onClick={() => send({ type: 'TOGGLE_ACTIVE_SKILL', skillId: skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0 || (!selected && game.progression.preparation.activeSkillIds.length >= 4)}>{selected ? 'Remove' : 'Select'} {skill.name} for Expedition</button>}
        {skill.kind === 'aura' && <button className="secondary" onClick={() => send({ type: 'SELECT_AURA', skillId: selected ? null : skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0}>{selected ? 'Remove' : 'Select'} Aura: {skill.name}</button>}
        {skill.kind === 'ultimate' && <button className="secondary" onClick={() => send({ type: 'SELECT_ULTIMATE', skillId: selected ? null : skill.id })} disabled={game.status !== 'preparation' || !eligible || rank === 0}>{selected ? 'Remove' : 'Select'} Ultimate: {skill.name}</button>}
        {rank < skill.maxRank && <button className="secondary" onClick={() => send({ type: 'INVEST_SKILL', skillId: skill.id })} disabled={game.status !== 'preparation' || !eligible || game.progression.skillPoints === 0}>Level up {skill.name}</button>}
      </div>
    </article>;
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
  return <main className={`shell ${page === 'skills' ? 'skills-route' : 'expedition-route'}`}>
    <header><p className="eyebrow">IDLER · EXPEDITION DASHBOARD</p><h1>{game.areaName}</h1><p className="muted">A quiet place to prepare, then let the Hero work.</p></header>
    <nav className="destination-nav" aria-label="Primary navigation">
      <a className={page === 'expedition' ? 'active' : ''} href="#expedition" onClick={() => setPage('expedition')}>Expedition</a>
      <a href="#area-map" onClick={() => setPage('expedition')}>Area Map</a>
      <a className={page === 'skills' ? 'active' : ''} href="#skills" onClick={() => setPage('skills')}>Skills</a>
      <a href="#preparation" onClick={() => setPage('expedition')}>Preparation</a>
      <a href="#hero" onClick={() => setPage('expedition')}>Hero</a>
      <a href="#inventory" onClick={() => setPage('expedition')}>Inventory</a>
    </nav>
    <nav className="destination-nav secondary-nav" aria-label="Secondary navigation">
      <a href="#history">History</a>
      <a href="#settings">Settings</a>
    </nav>
    <section className="dashboard-summary" id="expedition" aria-label="Expedition summary">
      <article><span className="label">Active progress</span><strong>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}</strong><span>{game.committed.experience} XP committed</span></article>
      <article><span className="label">Expedition risk</span><strong>{expeditionRisk}</strong><span>{Math.ceil(game.hero.health)}/{game.hero.maxHealth} Health</span></article>
      <article><span className="label">Hero Combat</span><strong>{heroCombatState}</strong><span>{game.combat.targetPolicy} target policy</span></article>
      <article><span className="label">Room timeline</span><strong>{progress} secured</strong><span>{game.roomCount - progress} remaining</span></article>
      <article><span className="label">Pending notifications</span><strong>{game.reviewQueue.length || 'None'}</strong><span>{game.reviewQueue.length ? 'Review queue needs attention' : 'Nothing needs review'}</span></article>
    </section>
    <section className="hero-card" id="hero" aria-label="Hero status">
      <div><span className="label">HERO</span><h2>{game.hero.name}</h2><p>Level {game.progression.level} · {game.progression.experience} XP</p><p>Health {Math.ceil(game.hero.health)}/{game.hero.maxHealth}</p><p>Mana {Math.floor(game.combat.heroMana)}/{game.combat.maxMana}</p><p>Build: {game.hero.attack} Attack · {game.combat.heroDefense} Defense · {Math.round(game.hero.attackInterval)} ms interval</p></div>
      <div className="health-bar" role="progressbar" aria-label="Hero health" aria-valuemin={0} aria-valuemax={game.hero.maxHealth} aria-valuenow={Math.ceil(game.hero.health)}><span style={{ width: `${Math.max(0, game.hero.health / game.hero.maxHealth * 100)}%` }} /></div>
      <div className="status-pill" data-status={game.status} role="status" aria-label="Expedition status">{game.status}</div>
    </section>
    <section className="panel review" aria-label="Review queue">
      <span className="label">REVIEW QUEUE</span>
      {game.reviewQueue.length === 0 ? <p>Nothing needs review.</p> : game.reviewQueue.map((item) => <p key={item}>{item}</p>)}
      <p className="points">Attribute points: {game.progression.attributePoints} · Skill points: {game.progression.skillPoints}</p>
      <div className="attribute-controls" aria-label="Attribute decisions">
        {(['might', 'vitality', 'agility', 'focus'] as const).map((attribute) => <button key={attribute} className="secondary" onClick={() => send({ type: 'SPEND_ATTRIBUTE', attribute })} disabled={game.status !== 'preparation' || game.progression.attributePoints === 0}>Spend 1 {attribute[0].toUpperCase() + attribute.slice(1)} <span>({game.progression.attributes[attribute]})</span></button>)}
      </div>
    </section>
    <section className="panel skills-page" id="skills" aria-label="Skills">
      <span className="label">SKILL TREE</span>
      <h2>Build your Skills</h2>
      <p className="muted">Spend Skill points to unlock nodes. Each node shows its prerequisite path and effect. Auras and Ultimates must be ranked here before they can be selected for an Expedition.</p>
      <p className="points">Skill points available: {game.progression.skillPoints} · Hero level: {game.progression.level}</p>
      <div className="skill-tree-grid">{skillTrees.map((tree) => <section className="skill-tree" key={tree} aria-label={`${tree} Skill tree`}><span className="label">{tree} tree</span>{game.skills.filter((skill) => skill.tree === tree).map(skillButton)}</section>)}</div>
    </section>
    <section className="panel preparation" id="preparation" aria-label="Preparation">
      <span className="label">PREPARATION</span>
      <h2>Build choices for the next Expedition</h2>
      <p className="muted">{game.status === 'active' ? 'Build changes are locked during the active Expedition.' : `${game.progression.preparation.activeSkillIds.length}/4 Active Skills selected · ${game.progression.preparation.auraId ? '1' : '0'}/1 Aura · ${game.progression.preparation.ultimateId ? '1' : '0'}/1 Ultimate`}</p>
      <p><a href="#skills" onClick={() => setPage('skills')}>Open the full Skill tree</a> to level Skills, inspect prerequisites, and choose Auras or Ultimates.</p>
      <label className="target-policy">Target policy <select aria-label="Target policy" value={game.progression.preparation.targetPolicy} onChange={(event) => send({ type: 'SET_TARGET_POLICY', policy: event.target.value as TargetPolicy })} disabled={game.status !== 'preparation'}>{policies.map((policy) => <option key={policy} value={policy}>{policy}</option>)}</select></label>
      <div className="consumable-controls" aria-label="Consumable preparation">
        <span className="label">CONSUMABLES</span>
        {(['health', 'mana'] as const).map((kind) => <label key={kind}>{kind[0].toUpperCase() + kind.slice(1)} Potion <select aria-label={`${kind} Potion size`} value={game.progression.preparation.potions[kind]?.size ?? 'Small'} onChange={(event) => send({ type: 'SET_POTION_PREPARATION', potion: kind, size: event.target.value as 'Small' | 'Medium' | 'Large' | 'Greater', thresholdPercent: game.progression.preparation.potions[kind]?.thresholdPercent ?? 0 })} disabled={game.status !== 'preparation'}>{['Small', 'Medium', 'Large', 'Greater'].map((size) => <option key={size}>{size}</option>)}</select> at or below <input aria-label={`${kind} Potion threshold`} type="number" min="0" max="100" value={game.progression.preparation.potions[kind]?.thresholdPercent ?? 0} onChange={(event) => send({ type: 'SET_POTION_PREPARATION', potion: kind, size: game.progression.preparation.potions[kind]?.size ?? 'Small', thresholdPercent: Number(event.target.value) })} disabled={game.status !== 'preparation'} />%</label>)}
        <p className="muted">{game.consumables.potions.map((potion) => `${potion.quantity} ${potion.size} ${potion.kind} Potion${potion.quantity === 1 ? '' : 's'}`).join(' · ')}</p>
        <div className="buff-controls"><span>Timed Combat buff:</span>{(['damage', 'attack-speed', 'health-regeneration', 'mana-regeneration', 'defense'] as const).map((buff) => <button key={buff} className="secondary" onClick={() => send({ type: 'SELECT_TIMED_BUFF', buff: game.progression.preparation.timedBuff === buff ? null : buff })} disabled={game.status !== 'preparation' || (game.consumables.timedBuffs[buff] <= 0 && game.progression.preparation.timedBuff !== buff)}>{game.progression.preparation.timedBuff === buff ? 'Remove' : 'Select'} {buff}</button>)}</div>
        <p className="muted">Potion cooldowns: Health {Math.ceil(game.combat.potionCooldowns.health / 1000)}s · Mana {Math.ceil(game.combat.potionCooldowns.mana / 1000)}s · active buff: {game.combat.timedBuff?.kind ?? 'none'}</p>
      </div>
      <button className="secondary" onClick={() => send({ type: 'RESPEC_SKILLS' })} disabled={game.status !== 'preparation'}>Free Respec</button>
    </section>
    <section className="panel" id="area-map" aria-label="Area Map">
      <span className="label">AREA MAP</span>
      <h2>Choose an Area</h2>
      <div className="area-map">{getAreaMap(game).map((area) => <button className="secondary" key={area.id} onClick={() => send({ type: 'SELECT_AREA', areaId: area.id })} disabled={area.status === 'locked' || game.status !== 'preparation'}>{area.name} · {area.status}{area.completions > 0 ? ` · ${area.completions} completion${area.completions === 1 ? '' : 's'}` : ''}</button>)}</div>
      <p className="muted">Areas unlock in order. Replay an Area to earn its chapter Boss.</p>
    </section>
    <section className="panel equipment" id="inventory" aria-label="Equipment and Loot">
      <span className="label">EQUIPMENT &amp; LOOT</span>
      <h2>Build equipment</h2>
      <p className="muted">Inventory: {game.inventory.length}/{inventoryCapacity()} Items · {availableInventorySpace(game)} space available. Full Inventory keeps a stronger eligible Item and explains what was discarded.</p>
      <div className="equipment-slots">{(['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring1', 'ring2', 'amulet'] as const).map((slot) => <p key={slot}><strong>{slot}</strong>: {game.equipment[slot]?.name ?? 'empty'}</p>)}</div>
      {inspectedItem ? <div className="item-inspector" aria-label="Item inspection"><h3>{itemLabel(inspectedItem)}</h3><p>{inspectedItem.quality} · Immediately identified</p><p>{statsLabel(inspectedItem) || 'No base stats'}{inspectedItem.affixes.length > 0 ? ` · ${inspectedItem.affixes.map((affix) => `${affix.name} ${affix.value}`).join(' · ')}` : ''}</p><p>Compared with: {compareItem(inspectedItem, game.equipment).map((item) => `${item.name} (${comparisonLabel(inspectedItem, item)})`).join(', ') || 'nothing equipped'}</p><div className="item-actions">{equipButton(inspectedItem)}{inspectedItem.slot === 'ring' && <>{equipButton(inspectedItem, 'ring1')}{equipButton(inspectedItem, 'ring2')}</>}<button className="secondary" onClick={() => send({ type: 'SALVAGE_ITEM', itemId: inspectedItem.id })} disabled={game.status !== 'preparation' || inspectedItem.exceptional}>Salvage for currency</button></div></div> : <p>No Items yet. Complete a Room to find one.</p>}
      <div className="inventory" aria-label="Inventory">{game.inventory.map((item) => <button className="secondary" key={item.id} onClick={() => setInspectedItemId(item.id)}>{itemLabel(item)}</button>)}</div>
    </section>
    <section className="grid">
      <article className="panel"><span className="label">EXPEDITION</span><h2>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}</h2><p>{game.roomType === 'combat' && game.enemy ? `${game.enemy.name}: ${Math.max(0, game.enemy.health)}/${game.enemy.maxHealth} health` : game.roomType === 'empty' ? 'Empty Room · resolving its effect' : 'Every Room is secured.'}</p><div className="room-track" role="progressbar" aria-label="Expedition Room progress" aria-valuemin={0} aria-valuemax={game.roomCount} aria-valuenow={progress}><span style={{ width: `${progress / game.roomCount * 100}%` }} /></div></article>
      <article className="panel"><span className="label">COMMITTED PROGRESS</span><h2>{game.committed.experience} XP</h2><p>{game.committed.currency} currency · retained at Room completion</p><p>{game.currency} persistent currency · includes deliberate Salvage rewards</p></article>
    </section>
    {game.roomType === 'combat' && game.enemy && <details className="panel detail-panel" open><summary>Combat detail</summary><section className="combat-state" aria-label="Combat state" aria-live="polite"><span className="label">COMBAT STATE</span><p>Target policy: {game.combat.targetPolicy}</p><p>Next Hero attack: {Math.max(0, game.hero.attackInterval - game.combat.heroAttackProgress)} ms</p><p>Statuses: {game.combat.heroStatuses.length + game.combat.enemyStatuses.length || 'none'}</p><div role="region" aria-label="Combat cooldowns"><p>Health potion cooldown: {Math.ceil(game.combat.potionCooldowns.health / 1000)}s</p><p>Mana potion cooldown: {Math.ceil(game.combat.potionCooldowns.mana / 1000)}s</p></div></section></details>}
    <section className="panel" aria-label="Room progress" aria-live="polite"><span className="label">ROOM PROGRESS</span><p>Room {Math.min(progress + 1, game.roomCount)} of {game.roomCount}; {progress} secured and {game.roomCount - progress} remaining.</p></section>
    {game.outcome && <details className="panel detail-panel" open><summary>Expedition outcome</summary><section aria-label="Expedition outcome" aria-live="polite"><span className="label">EXPEDITION OUTCOME</span><h2>{game.outcome.result}</h2><p>Room reached: {game.outcome.roomReached} · committed {game.outcome.committed.experience} XP and {game.outcome.committed.currency} currency</p><p>Lost from the incomplete Room: {game.outcome.lost.experience} XP and {game.outcome.lost.currency} currency.</p><p>Consumables used: {Object.entries(game.outcome.consumables.potionsUsed).map(([kind, count]) => `${count} ${kind} Potion${count === 1 ? '' : 's'}`).join(' · ') || 'none'}{game.outcome.consumables.timedBuff ? ` · timed buff: ${game.outcome.consumables.timedBuff}` : ''}</p><p>{game.outcome.result === 'defeated' ? game.outcome.willRestart ? `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; the Area will restart automatically.` : `Recovery: ${Math.ceil(game.recoveryRemainingMilliseconds / 1000)}s remaining; automatic repeat is stopped.` : 'No Recovery is required.'}</p></section></details>}
    <section className="controls" aria-label="Expedition commands"><button onClick={() => send({ type: 'START_EXPEDITION' })} disabled={!canStart}>Start Expedition</button><button className="secondary" onClick={() => send({ type: 'WITHDRAW' })} disabled={game.status !== 'active'}>Withdraw</button>{game.status === 'recovery' && <button className="secondary" onClick={() => send({ type: 'STOP_AUTO_REPEAT' })} disabled={!game.autoRepeat}>Stop automatic repeat</button>}<button className="secondary" onClick={simulateFiveMinutes}>Simulate 5 minutes</button><span className="muted">{game.status === 'active' ? 'The Hero is acting automatically.' : game.status === 'recovery' ? 'Recovery is advancing on the controlled clock.' : 'Choose Start Expedition when ready.'}</span></section>
    <section className="panel log" id="history" aria-label="Recent outcomes"><span className="label">RECENT OUTCOMES</span><div className="log-entries" aria-live="polite">{game.events.slice().reverse().map((item) => <p key={item.id}><time dateTime={`PT${item.timestampMilliseconds / 1_000}S`}>{formatEventTime(item.timestampMilliseconds)}</time><span>{item.message}</span></p>)}</div></section>
    <section className="panel settings" id="settings" aria-label="Settings"><span className="label">SETTINGS</span><h2>Expedition preferences</h2><p className="muted">The controlled clock and automatic Expedition behavior are shown here while settings are being expanded.</p><p>Automatic repeat: {game.autoRepeat ? 'on' : 'off'} · Controlled time: enabled</p><div className="save-controls" aria-label="Developer save tools"><h3>Developer save tools</h3><textarea aria-label="Save data" value={saveText} onChange={(event) => setSaveText(event.target.value)} placeholder="Export a save or paste one here" rows={4} /><div><button className="secondary" onClick={exportSave}>Export Save</button><button className="secondary" onClick={importSave} disabled={!saveText.trim()}>Import Save</button></div>{saveMessage && <p role="status">{saveMessage}</p>}</div></section>
  </main>;
}
