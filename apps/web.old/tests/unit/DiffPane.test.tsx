import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffPane, compactDiffPath } from '../../src/components/DiffPane.js';
import type { FileDiff } from '@clio/core';

afterEach(cleanup);

const sampleDiff: FileDiff = {
  type: 'file_diff',
  path: 'src/handlers.go',
  unified_diff: `--- a/src/handlers.go
+++ b/src/handlers.go
@@ -3,4 +3,5 @@
-func handle(r *Request) {
-    println("got request")
+func handle(r *Request) error {
+    log.Info("request received", "id", r.ID)
+    return nil
 }
`,
};

describe('DiffPane', () => {
  it('renders the file path and stats', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    expect(screen.getByTestId('diff-pane')).toBeTruthy();
    expect(screen.getByTestId('diff-pane').textContent).toContain('src/handlers.go');
    expect(screen.getByTestId('diff-pane').textContent).toMatch(/\+3/);
    expect(screen.getByTestId('diff-pane').textContent).toMatch(/[−-]2/);
  });

  it('compacts long absolute paths in the drawer title', () => {
    const path =
      '/home/jcernuda/gact-tui/tmp/owned-clio-web-files-20260617-235829-2140843/workspace/handlers.go';
    render(() => (
      <DiffPane diff={{ ...sampleDiff, path }} onClose={() => undefined} />
    ));
    const heading = screen.getByRole('heading', { name: path });
    expect(heading.textContent).toBe('workspace/handlers.go');
    expect(heading.getAttribute('title')).toBe(path);
  });

  it('uses a short path tail when no workspace segment exists', () => {
    expect(
      compactDiffPath(
        '/very/long/generated/root/without/workspace-name/nested/src/handlers.go',
      ),
    ).toBe('.../src/handlers.go');
  });

  it('exposes per-hunk local review buttons', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    expect(screen.getByTestId('diff-pane-apply-0')).toBeTruthy();
    expect(screen.getByTestId('diff-pane-reject-0')).toBeTruthy();
  });

  it('marks a hunk as reviewed after the review button is clicked', () => {
    let appliedIdx = -1;
    render(() => (
      <DiffPane
        diff={sampleDiff}
        onClose={() => undefined}
        onApplyHunk={(i) => {
          appliedIdx = i;
        }}
      />
    ));
    fireEvent.click(screen.getByTestId('diff-pane-apply-0'));
    expect(appliedIdx).toBe(0);
    expect(screen.getByTestId('diff-pane-hunk-0').className).toMatch(/applied/);
  });

  it('disables both buttons once a hunk is resolved', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('diff-pane-reject-0'));
    const apply = screen.getByTestId('diff-pane-apply-0') as HTMLButtonElement;
    const reject = screen.getByTestId('diff-pane-reject-0') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
  });

  // v0.2 (file_diff status/edit_mode/lines) — surfaced in the pane header.
  it('renders the v0.2 status badge, edit_mode, and wire line counts', () => {
    render(() => (
      <DiffPane
        diff={{
          ...sampleDiff,
          status: 'applied',
          edit_mode: 'whole',
          lines_added: 42,
          lines_removed: 7,
        }}
        onClose={() => undefined}
      />
    ));
    const status = screen.getByTestId('diff-pane-status');
    expect(status.textContent).toBe('applied');
    expect(status.getAttribute('data-status')).toBe('applied');
    expect(status.className).toContain('chip--ok');
    expect(screen.getByTestId('diff-pane-editmode').textContent).toBe('whole-file');
    // Wire tally wins over the hunk-derived count (+3/−2).
    expect(screen.getByTestId('diff-pane-adds').textContent).toBe('+42');
    expect(screen.getByTestId('diff-pane-dels').textContent).toBe('−7');
  });

  it('renders apply_failed as an error-toned badge', () => {
    render(() => (
      <DiffPane diff={{ ...sampleDiff, status: 'apply_failed' }} onClose={() => undefined} />
    ));
    const status = screen.getByTestId('diff-pane-status');
    expect(status.textContent).toBe('apply failed');
    expect(status.className).toContain('chip--err');
  });

  it('omits the status/edit_mode badges for v0.1 diffs and keeps the derived count', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    expect(screen.queryByTestId('diff-pane-status')).toBeNull();
    expect(screen.queryByTestId('diff-pane-editmode')).toBeNull();
    // No wire tally -> derived hunk count (+3/−2).
    expect(screen.getByTestId('diff-pane-adds').textContent).toBe('+3');
    expect(screen.getByTestId('diff-pane-dels').textContent).toBe('−2');
  });

  it('renders a graceful no-hunks state when the diff is empty', () => {
    render(() => (
      <DiffPane diff={{ ...sampleDiff, unified_diff: '' }} onClose={() => undefined} />
    ));
    expect(screen.getByTestId('diff-pane').textContent).toContain('no parseable hunks');
  });

  // W3 Tier-2: line-number gutter + per-line syntax highlighting.
  it('renders an old/new line-number gutter seeded from the @@ header', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    const hunk = screen.getByTestId('diff-pane-hunk-0');
    const gutters = hunk.querySelectorAll('.diffpane__lineno');
    // Every line renders two gutter cells (old | new).
    expect(gutters.length).toBeGreaterThan(0);
    expect(gutters.length % 2).toBe(0);
    // The @@ -3,4 +3,5 @@ header seeds both sides at line 3: the first
    // line is a deletion → old=3, new empty.
    expect(gutters[0]?.textContent).toBe('3');
    expect(gutters[1]?.textContent).toBe('');
  });

  it('syntax-highlights diff lines for known file extensions (.go)', async () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    const hunk = screen.getByTestId('diff-pane-hunk-0');
    // hljs loads lazily, then wraps Go keywords (func/return) in
    // .hljs-keyword spans — eventually consistent.
    await waitFor(() => {
      expect(hunk.querySelectorAll('.hljs-keyword').length).toBeGreaterThan(0);
    });
  });

  it('falls back to plain text for unknown extensions', async () => {
    render(() => (
      <DiffPane
        diff={{ ...sampleDiff, path: 'data/blob.xyz' }}
        onClose={() => undefined}
      />
    ));
    const hunk = screen.getByTestId('diff-pane-hunk-0');
    // Content renders immediately regardless of hljs.
    expect(hunk.textContent).toContain('func handle');
    // Unknown extension never highlights, even after hljs has loaded.
    await waitFor(() => {
      // Force a tick for the lazy import to settle.
      expect(hunk.textContent).toContain('func handle');
    });
    expect(hunk.querySelectorAll('.hljs-keyword').length).toBe(0);
  });
});
