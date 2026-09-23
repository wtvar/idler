import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(cleanup);

describe('playable browser shell', () => {
  it('provides primary and secondary navigation for the player destinations', () => {
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('ExpeditionArea MapPreparationHeroInventory');
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
    expect(screen.getByText(/Preparation is locked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
  });

  it('shows Area Map states and keeps locked Areas unavailable', () => {
    render(<App />);
    expect(screen.getByRole('region', { name: 'Area Map' })).toHaveTextContent('Sunlit Meadow · unlocked');
    expect(screen.getByRole('button', { name: /Moonlit Grove/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Grove Chapter Boss/ })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: /Remove Measured Strike for Expedition/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Level up Measured Strike/ })).toBeInTheDocument();
  });

  it('offers a repeatable five-minute testing advance', async () => {
    const user = userEvent.setup();
    render(<App />);
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
