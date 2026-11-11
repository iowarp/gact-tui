import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { keyInput, pagePoint } from './browser-live-input';
import { browserLiveSocketTarget, liveRefusalMessage } from './browser-live-socket';
import { PermissionOperationDetails } from './permission-operation-details';
import { browserPageLabel } from './use-browser-pages';
import { tabForOpenRequest } from './workbench-open-request';

afterEach(cleanup);

describe('the live view maps the shown frame to page pixels', () => {
  const viewport = { width: 1280, height: 800 };

  it('scales a point on a frame that fills its box', () => {
    const box = { left: 0, top: 0, width: 640, height: 400 };
    expect(pagePoint(320, 200, box, viewport)).toEqual({ x: 640, y: 400 });
  });

  it('accounts for the letterbox of a tall box (a phone)', () => {
    const box = { left: 0, top: 100, width: 390, height: 600 };
    // The frame is 390 x 243.75, centred: it starts 178.125 px down the box.
    expect(pagePoint(195, 100 + 178.125 + 121.875, box, viewport)).toEqual({ x: 640, y: 400 });
    expect(pagePoint(195, 110, box, viewport)).toBeNull();
  });

  it('sends nothing before the page reported its size', () => {
    expect(
      pagePoint(1, 1, { left: 0, top: 0, width: 10, height: 10 }, { width: 0, height: 0 }),
    ).toBeNull();
  });
});

describe('keys', () => {
  it('sends printable characters as text and the rest as keys with modifiers', () => {
    const plain = { ctrlKey: false, metaKey: false, altKey: false };
    expect(keyInput({ key: 'a', ...plain })).toEqual({ type: 'text', text: 'a' });
    expect(keyInput({ key: 'Enter', ...plain })).toEqual({
      type: 'key',
      action: 'press',
      key: 'Enter',
    });
    expect(keyInput({ key: 'a', ...plain, ctrlKey: true })).toEqual({
      type: 'key',
      action: 'press',
      key: 'Control+a',
    });
  });
});

describe('the live socket', () => {
  it('speaks the browser protocol and carries the token beside it', () => {
    const { url, protocols } = browserLiveSocketTarget(
      'https://agent.example/',
      'secret',
      'sess 1',
      'p2',
    );
    expect(url.toString()).toBe('wss://agent.example/v1/sessions/sess%201/browser/p2/live');
    expect(protocols).toEqual(['clio.browser.v1', 'clio-bearer.c2VjcmV0']);
    expect(browserLiveSocketTarget('http://127.0.0.1', undefined, 's', 'p1').protocols).toEqual([
      'clio.browser.v1',
    ]);
  });

  it('explains refusals in plain language', () => {
    expect(liveRefusalMessage(4404, 'page_not_found')).toBe('This page is closed.');
    expect(liveRefusalMessage(4401, '')).toMatch(/access token/u);
  });
});

it('opens a browser page as a tab labelled by its session', () => {
  const tab = tabForOpenRequest(
    { kind: 'browser', pageId: 'p3', sessionId: 'sess_child', label: 'explore: arXiv' },
    'sess_parent',
    'ws_1',
  );
  expect(tab).toEqual({
    id: 'browser:p3',
    kind: 'browser',
    label: 'explore: arXiv',
    pageId: 'p3',
    sessionId: 'sess_child',
    workspaceId: 'ws_1',
  });
  expect(browserPageLabel({ label: '', title: '', host: 'arxiv.org' })).toBe('arxiv.org');
});

it('names the site, page and address of a browser host question', () => {
  const interaction: PendingInteraction = {
    id: 'permission:perm_b',
    kind: 'permission',
    status: 'pending',
    title: 'Let the browser load arxiv.org',
    owner_session_id: 'sess_1',
    attended_session_id: 'sess_1',
    source: { protocol: 'native', tool_name: 'browser_host' },
    created_at: '2026-11-04T05:00:00Z',
    payload: {
      tool_call: {
        tool_name: 'browser_host',
        input: {
          host: 'arxiv.org',
          url: 'https://arxiv.org/list/cs.DC/new',
          page: 'p1',
          label: 'HDF5 survey',
        },
      },
      execution: { computer: 'lab', cwd: '/work' },
    },
  };
  render(<PermissionOperationDetails interaction={interaction} />);
  expect(screen.getByText('Open a website in the shared browser')).toBeVisible();
  expect(screen.getByText('arxiv.org')).toBeVisible();
  expect(screen.getByText('HDF5 survey')).toBeVisible();
  expect(screen.getByText('https://arxiv.org/list/cs.DC/new')).toBeVisible();
  expect(screen.queryByText('/work')).not.toBeInTheDocument();
});
