import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { DiffPane } from '../../src/components/DiffPane.js';
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

  it('exposes per-hunk Apply / Reject buttons', () => {
    render(() => <DiffPane diff={sampleDiff} onClose={() => undefined} />);
    expect(screen.getByTestId('diff-pane-apply-0')).toBeTruthy();
    expect(screen.getByTestId('diff-pane-reject-0')).toBeTruthy();
  });

  it('marks a hunk as applied after Apply is clicked', () => {
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

  it('renders a graceful no-hunks state when the diff is empty', () => {
    render(() => (
      <DiffPane diff={{ ...sampleDiff, unified_diff: '' }} onClose={() => undefined} />
    ));
    expect(screen.getByTestId('diff-pane').textContent).toContain('no parseable hunks');
  });
});
