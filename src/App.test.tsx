import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(cleanup);

describe('playable browser shell', () => {
  it('lets the player start an Expedition from the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sunlit Meadow' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(screen.getByText(/Preparation is locked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
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
});
