// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home, type AccessHelp } from '../src/ui/panel/Home';

const listener = { addListener: vi.fn(), removeListener: vi.fn() };

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-id', getURL: (p: string) => `chrome-extension://test-id/${p}` },
    tabs: { query: vi.fn(async () => []), onActivated: listener, onUpdated: listener, create: vi.fn() },
  });
});

const renderHome = (access: AccessHelp | null, captureError: string | null = null) =>
  render(
    <Home
      captures={[]}
      selecting={false}
      access={access}
      captureError={captureError}
      onDismissError={() => undefined}
      onCapture={() => undefined}
      onAllowAll={() => undefined}
      onOpen={() => undefined}
      onLibrary={() => undefined}
      toast={() => undefined}
    />,
  );

describe('capture access help', () => {
  it('offers "Allow on all sites" when Eidetic has no access yet', () => {
    renderHome({ mode: 'area', reason: 'ask' });
    expect(screen.getByTestId('access-help').textContent).toMatch(/hasn’t given Eidetic access/);
    expect(screen.getByRole('button', { name: 'Allow on all sites' })).toBeTruthy();
  });

  it('on a browser page or local file, says Chrome never allows capture there (instead of asking for access again)', () => {
    renderHome({ mode: 'area', reason: 'browser-page' });
    const help = screen.getByTestId('access-help');
    expect(help.textContent).toMatch(/doesn’t let extensions capture this page/);
    expect(help.textContent).toMatch(/new tab/);
    expect(help.textContent).toMatch(/Allow access to file URLs/);
    expect(screen.queryByRole('button', { name: 'Allow on all sites' })).toBeNull();
  });

  it('when a website still refuses after access was given, suggests reloading it', () => {
    renderHome({ mode: 'area', reason: 'blocked' });
    const help = screen.getByTestId('access-help');
    expect(help.textContent).toMatch(/allowed on all sites, but Chrome still blocks this page/);
    expect(help.textContent).toMatch(/reload it/);
    expect(screen.queryByRole('button', { name: 'Allow on all sites' })).toBeNull();
    screen.getByRole('button', { name: 'Open Eidetic’s details' }).click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/?id=test-id' });
  });

  it('shows other capture failures as an error card', () => {
    renderHome(null, 'Something broke.');
    expect(screen.getByTestId('capture-error').textContent).toMatch(/Something broke/);
    expect(screen.queryByTestId('access-help')).toBeNull();
  });
});
