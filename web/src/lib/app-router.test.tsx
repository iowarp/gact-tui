import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRouter } from './app-router';
import { useLiveLocation } from './live-location';

const probe = { renders: 0, go: (_to: string) => {} };

function RoutedReader() {
  useEffect(() => {
    probe.renders += 1;
  });
  return <p data-testid="routed">{useLocation().pathname}</p>;
}

function LiveReader() {
  const navigate = useNavigate();
  useEffect(() => {
    probe.go = navigate;
  }, [navigate]);
  return <p data-testid="live">{useLiveLocation().pathname}</p>;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  probe.renders = 0;
});

describe('AppRouter', () => {
  it('keeps the router location while moving between Settings sections', async () => {
    window.history.replaceState(null, '', '/w/ws_1/s/sess_1');
    render(
      <AppRouter>
        <RoutedReader />
        <LiveReader />
      </AppRouter>,
    );
    await act(async () => probe.go('/settings/memory'));
    expect(screen.getByTestId('routed')).toHaveTextContent('/settings/memory');
    const settled = probe.renders;

    await act(async () => probe.go('/settings/connection'));
    expect(screen.getByTestId('live')).toHaveTextContent('/settings/connection');
    expect(screen.getByTestId('routed')).toHaveTextContent('/settings/memory');
    expect(probe.renders).toBe(settled);

    await act(async () => probe.go('/w/ws_1/s/sess_2'));
    expect(screen.getByTestId('routed')).toHaveTextContent('/w/ws_1/s/sess_2');
    expect(screen.getByTestId('live')).toHaveTextContent('/w/ws_1/s/sess_2');
  });

  it('follows the browser back button out of Settings', async () => {
    window.history.replaceState(null, '', '/w/ws_1/s/sess_1');
    render(
      <AppRouter>
        <RoutedReader />
        <LiveReader />
      </AppRouter>,
    );
    await act(async () => probe.go('/settings/memory'));
    await act(async () => probe.go('/settings/connection'));
    await act(async () => {
      window.history.go(-2);
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });
    expect(screen.getByTestId('routed')).toHaveTextContent('/w/ws_1/s/sess_1');
    expect(screen.getByTestId('live')).toHaveTextContent('/w/ws_1/s/sess_1');
  });
});
