import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { SettingsPanel } from '../components/SettingsPanel';
import { SettingsProvider } from '../providers/settings-provider';

describe('SettingsPanel - Reset Local Data (#1025)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'removeItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Reset Local Data" button and opens confirmation modal on click', () => {
    render(
      <SettingsProvider>
        <SettingsPanel />
      </SettingsProvider>
    );

    const resetButton = screen.getByRole('button', { name: /reset local data/i });
    expect(resetButton).toBeInTheDocument();

    // Modal should not be open initially
    expect(screen.queryByText(/are you sure you want to clear local gameplay data/i)).not.toBeInTheDocument();

    // Click trigger button
    fireEvent.click(resetButton);

    // Modal should now be visible
    expect(screen.getByText(/are you sure you want to clear local gameplay data/i)).toBeInTheDocument();
  });

  it('clears local storage keys and closes modal upon confirmation', () => {
    localStorage.setItem('dewordle_game_stats', JSON.stringify({ score: 10 }));

    render(
      <SettingsProvider>
        <SettingsPanel />
      </SettingsProvider>
    );

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /reset local data/i }));

    // Confirm action
    const confirmButton = screen.getByRole('button', { name: /yes, reset data/i });
    fireEvent.click(confirmButton);

    // Verify localStorage cleanup
    expect(localStorage.removeItem).toHaveBeenCalledWith('dewordle_game_stats');
    expect(localStorage.removeItem).toHaveBeenCalledWith('dewordle_session_history');
    expect(localStorage.removeItem).toHaveBeenCalledWith('dewordle_offline_state');

    // Modal should close
    expect(screen.queryByText(/are you sure you want to clear local gameplay data/i)).not.toBeInTheDocument();
  });
});