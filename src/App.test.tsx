import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('playable browser shell', () => {
  it('lets the player start an Expedition from the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sunlit Meadow' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start Expedition' }));
    expect(screen.getByText(/Preparation is locked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
  });
});
