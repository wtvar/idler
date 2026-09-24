import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => window.localStorage.clear());

describe('playable browser shell', () => {
  it('provides primary and secondary navigation for the player destinations', () => {
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('ExpeditionArea MapSkillsPreparationHeroInventory');
    expect(screen.getByRole('navigation', { name: 'Secondary navigation' })).toHaveTextContent('HistorySettings');
    expect(screen.getByRole('link', { name: 'Area Map' })).toHaveAttribute('href', '#area-map');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#settings');
  });

  it('puts active progress, risk, Combat, Room timeline, and pending notifications on the dashboard', () => {
    render(<App />);

    const summary = screen.getByRole('region', { name: 'Expedition summary' });
    expect(summary).toHaveTextContent('Active progress');
    expect(summary).toHaveTextContent('Expedition risk');
    expect(summary).toHaveTextContent('Hero Combat');
    expect(summary).toHaveTextContent('Room timeline');
    expect(summary).toHaveTextContent('Pending notifications');
  });

  it('lets the player start an Expedition from the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sunlit Meadow' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(screen.getByRole('region', { name: 'Preparation' })).toHaveTextContent(/Preparation is locked/);
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
  });

  it('shows Area Map states and keeps locked Areas unavailable', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Area Map' })).toHaveTextContent('Sunlit Meadow · unlocked');
    expect(screen.getByRole('button', { name: /Moonlit Grove/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cinderstep Pass Chapter Boss/ })).toBeDisabled();
  });

  it('exposes Preparation choices and locks them after the Expedition starts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target policy' }), 'lowest-health');
    expect(screen.getByRole('combobox', { name: 'Target policy' })).toHaveValue('lowest-health');
    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(screen.getByRole('combobox', { name: 'Target policy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Free Respec' })).toBeDisabled();
  });

  it('shows a separate rank-up control for Active Skills', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Skills' })).toBeInTheDocument();
  });

  it('shows Skill trees, prerequisites, descriptions, and Aura or Ultimate rank-up controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Skills' }));
    expect(screen.getByRole('region', { name: 'Skills' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'physical Skill tree' })).toHaveTextContent('Requires: Measured Strike');
    expect(screen.getByText('The selected Aura improves Mana regeneration.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level up Arcane Aura' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Level up Meteor' })).toBeDisabled();
  });

  it('exposes keyboard-friendly status text and expandable secondary detail', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('status', { name: 'Expedition status' })).toHaveTextContent('preparation');
    expect(screen.getByRole('progressbar', { name: 'Hero health' })).toHaveAttribute('aria-valuenow', '100');
    await user.tab();
    expect(screen.getByRole('link', { name: 'Expedition' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Area Map' })).toHaveFocus();
  });

  it('provides text equivalents for combat state, cooldowns, Room progress, and outcomes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(screen.getByRole('region', { name: 'Combat state' })).toHaveTextContent(/Next Hero attack/);
    expect(screen.getByRole('region', { name: 'Combat cooldowns' })).toHaveTextContent(/Health potion cooldown/);
    expect(screen.getByRole('region', { name: 'Room progress' })).toHaveTextContent(/Room 1 of/);
    await user.click(screen.getByText('Combat detail'));
    expect(screen.queryByRole('region', { name: 'Combat state' })).not.toBeVisible();
    await user.click(screen.getByText('Combat detail'));
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(screen.getByRole('region', { name: 'Expedition outcome' })).toHaveTextContent(/Recovery|No Recovery/);
    await user.click(screen.getByRole('link', { name: 'History' }));
    expect(screen.getByRole('region', { name: 'Recent outcomes' })).toHaveTextContent('Expedition withdrawn · Sunlit Meadow');
  });

  it('offers a repeatable five-minute testing advance', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Automatically repeat Expeditions' }));
    const advance = screen.getByRole('button', { name: 'Simulate 5 minutes' });
    await user.click(advance);
    expect(screen.getByText('Level 1 · 30 XP')).toBeInTheDocument();
    await user.click(advance);
    expect(screen.getByText('Level 1 · 60 XP')).toBeInTheDocument();
  });

  it('lets the player inspect and equip a found Item between Expeditions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Simulate 5 minutes' }));
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await user.click(screen.getByRole('button', { name: /Meadowguard Mail/ }));

    expect(screen.getByRole('heading', { name: /Meadowguard Mail/ })).toBeInTheDocument();
    expect(screen.getByText(/Compared with: nothing equipped/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Equip' }));
    expect(screen.getByText(/17 Defense/)).toBeInTheDocument();
  });

  it('adds newly found Items to the Review queue until they are handled', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Automatically repeat Expeditions' }));
    await user.click(screen.getByRole('button', { name: 'Simulate 5 minutes' }));

    const queue = screen.getByRole('region', { name: 'Review queue' });
    expect(queue).toHaveTextContent(/Item and Loot decision/);
    await user.click(within(queue).getAllByRole('link', { name: 'Review Loot' })[0]);
    expect(screen.getByRole('heading', { name: /Meadowguard Mail/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep in Inventory' }));
    expect(queue).not.toHaveTextContent(/Meadowguard Mail/);
  });

  it('lets the player change the automatic repeat preference without interrupting Combat', async () => {
    const user = userEvent.setup();
    render(<App />);
    const autoRepeat = screen.getByRole('checkbox', { name: 'Automatically repeat Expeditions' });

    expect(autoRepeat).toBeChecked();
    await user.click(autoRepeat);
    expect(autoRepeat).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(autoRepeat).not.toBeChecked();
    expect(screen.getByRole('status', { name: 'Expedition status' })).toHaveTextContent('active');
    await user.click(autoRepeat);
    expect(screen.getByRole('status', { name: 'Expedition status' })).toHaveTextContent('active');
  });

  it('explains offline outcome rewards, losses, Recovery, and restart status', async () => {
    const { createGame, dispatch } = await import('./simulation/simulation');
    const defeated = dispatch(createGame(7, { startingHealth: 1, enemyAttack: 100 }), { type: 'START_EXPEDITION' });
    window.localStorage.setItem('idler.save', JSON.stringify({
      format: 'idler-save', version: 2, state: defeated, savedAtMilliseconds: Date.now() - 10_000,
    }));
    render(<App />);

    const summary = screen.getByRole('region', { name: 'Offline Summary' });
    expect(summary).toHaveTextContent('Defeat');
    expect(summary).toHaveTextContent('XP and');
    expect(summary).toHaveTextContent('lost');
    expect(summary).toHaveTextContent('Recovery');
    expect(summary).toHaveTextContent(/restart/i);
  });

  it('explains Inventory space and offers deliberate Salvage for ordinary Items', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Simulate 5 minutes' }));
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await user.click(screen.getByRole('button', { name: /Meadowguard Mail/ }));

    expect(screen.getByText(/Inventory: \d+\/12 Items/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvage for currency' })).toBeDisabled();
  });
});
