import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';
import {
  REAL_BACKEND,
  openSettingsSection,
  realBackendReachable,
  shot,
  withRealBackendPage,
} from './screenshots-helpers';

test.describe('CLIO harness — visual proofs', () => {
  test('connect-screen renders wordmark and form', async ({ page }) => {
    // Force the connect route explicitly. A bare `/` is non-deterministic:
    // when a backend is reachable (clio on :17800, which this project
    // requires for live testing) the splash auto-probes and advances past
    // connect, so the screen never renders. `?route=connect` is the
    // intended way to view it (the audit/oneturn specs use it too).
    await page.goto('/?route=connect');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await expect(page.getByTestId('connect-submit')).toBeVisible();
    await page.screenshot({ path: shot('connect-screen'), fullPage: false });
  });

  test('empty-chat fixture starts as a conversation-first workspace', async ({ page }) => {
    await page.goto('/?route=chat&fixture=empty-sidebar');
    // Conversation-first: the sessions rail renders its empty state (no session
    // rows) while the main pane leads with the start-a-conversation invitation.
    await expect(page.getByTestId('sidebar-empty')).toBeVisible();
    await expect(page.locator('[data-testid^="session-row-"]')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pane')).toBeVisible();
    await expect(page.getByTestId('transcript-pane')).toContainText(/Pick a session or start fresh/i);
    await page.screenshot({ path: shot('empty-chat-first-run'), fullPage: false });
  });

  test('chat-streaming fixture shows assistant mid-response', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat-streaming'), fullPage: false });
  });

  test('permission-card fixture renders inline approval card', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permission-card')).toBeVisible();
    await page.screenshot({ path: shot('permission-card'), fullPage: false });
  });

  test('density-verbose shows full tool-call bodies', async ({ page }) => {
    await page.goto('/?route=chat&fixture=verbose');
    await expect(page.getByTestId('transcript')).toHaveAttribute('data-density', 'verbose');
    await page.screenshot({ path: shot('density-verbose'), fullPage: false });
  });

  test('density-summary hides tool noise', async ({ page }) => {
    await page.goto('/?route=chat&fixture=summary');
    await expect(page.getByTestId('transcript')).toHaveAttribute('data-density', 'summary');
    await page.screenshot({ path: shot('density-summary'), fullPage: false });
  });

  // Wave 0 + 2 additions.

  test('starting-clio-splash renders the boot splash', async ({ page }) => {
    await page.goto('/?route=splash&hold=1');
    await expect(page.getByTestId('splash-screen')).toBeVisible();
    await expect(page.getByTestId('splash-spinner')).toBeVisible();
    await page.screenshot({ path: shot('starting-clio-splash'), fullPage: false });
  });

  test('first-run-install renders the one-swoop install view', async ({ page }) => {
    await page.goto('/?route=splash&install=demo');
    await expect(page.getByTestId('splash-installing')).toBeVisible();
    await expect(page.getByTestId('splash-install-log')).toBeVisible();
    await page.screenshot({
      path: shot('first-run-install'),
      fullPage: false,
    });
  });

  test('settings-backends lists registered endpoints', async ({ page }) => {
    // The `?route=settings-backends` query triggers `seedFixtureBackends`
    // in App.tsx, which adds three demo entries (`clio:local`,
    // `alcf:polaris`, `remote:flagship`) when the registry is empty.
    // Assert against the actual seeded id, not the stale
    // `sidecar:local` id from an earlier scheme.
    await page.goto('/?route=settings-backends');
    await expect(page.getByTestId('settings-backends')).toBeVisible();
    await expect(page.getByTestId('settings-row-clio:local')).toBeVisible();
    await page.screenshot({ path: shot('settings-backends'), fullPage: false });
  });

  test('settings-about summarizes app and backend capabilities', async ({ page }) => {
    await page.goto('/?route=settings&section=about');
    await expect(page.getByTestId('settings-about')).toBeVisible();
    await expect(page.getByTestId('settings-cap-summary')).toBeVisible();
    await expect(page.getByTestId('settings-cap-enabled')).toContainText('enabled');
    await expect(page.getByText(/polish wave/i)).toHaveCount(0);
    await page.screenshot({ path: shot('settings-shell-about'), fullPage: false });
  });

  test('settings-appearance keeps theme controls compact', async ({ page }) => {
    await page.goto('/?route=settings&section=appearance');
    await expect(page.getByTestId('settings-appearance')).toBeVisible();
    await expect(page.getByTestId('settings-theme-dark')).toBeVisible();
    await expect(page.getByTestId('settings-theme-presets')).toBeVisible();
    await expect(page.getByText(/High contrast maximizes/i)).toHaveCount(0);
    await page.screenshot({ path: shot('settings-shell-appearance'), fullPage: false });
  });

  test('add-remote-ssh-wizard captures the tunnel form', async ({ page }) => {
    await page.goto('/?route=add-remote');
    await page.getByTestId('add-remote-mode-ssh').click();
    await expect(page.getByTestId('add-remote-ssh-host')).toBeVisible();
    await page.getByTestId('add-remote-label').fill('ALCF · polaris (preview)');
    await page.getByTestId('add-remote-ssh-host').fill('polaris.alcf.anl.gov');
    await page.getByTestId('add-remote-ssh-user').fill('jaime');
    await page.getByTestId('add-remote-ssh-key').fill('~/.ssh/id_ed25519');
    await expect(page.getByTestId('add-remote-save')).toBeVisible();
    await page.screenshot({ path: shot('add-remote-ssh-wizard'), fullPage: false });
  });

  test('multi-backend-picker shows the dropdown with status pips', async ({ page }) => {
    // Seed the registry via localStorage before any navigation so the
    // picker has entries to render when the chat shell mounts.
    await page.addInitScript(() => {
      const seed = {
        backends: [
          {
            id: 'sidecar:local',
            label: 'Local sidecar',
            url: 'http://127.0.0.1:17800',
            bearerToken: '••••',
            kind: 'local-sidecar',
            capabilities: { contract_version: '0.2' },
          },
          {
            id: 'alcf:polaris',
            label: 'ALCF · polaris',
            url: 'http://polaris.alcf.anl.gov:8100',
            bearerToken: '••••',
            kind: 'ssh-tunnel',
            capabilities: { contract_version: '0.2' },
          },
          {
            id: 'remote:flagship',
            label: 'Flagship · staging',
            url: 'https://clio-staging.example.com',
            bearerToken: '••••',
            kind: 'http',
            lastError: 'connect ECONNREFUSED 1.2.3.4:443',
          },
        ],
        currentId: 'sidecar:local',
      };
      window.localStorage.setItem('clio.backends.v1', JSON.stringify(seed));
    });
    await page.goto('/?route=chat&fixture=normal');
    await page.getByTestId('backend-picker').click();
    await expect(page.getByTestId('backend-picker-menu')).toBeVisible();
    await expect(page.getByTestId('backend-picker-item-sidecar:local')).toBeVisible();
    await page.screenshot({ path: shot('multi-backend-picker'), fullPage: false });
  });

  test('permission-allow-once captures the allow-once highlight', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permcard-allow-once')).toBeVisible();
    await page.getByTestId('permcard-allow-once').focus();
    await page.screenshot({ path: shot('permission-allow-once'), fullPage: false });
  });

  test('permission-deny captures the deny highlight', async ({ page }) => {
    await page.goto('/?route=chat&fixture=permission');
    await expect(page.getByTestId('permcard-deny')).toBeVisible();
    await page.getByTestId('permcard-deny').focus();
    await page.screenshot({ path: shot('permission-deny'), fullPage: false });
  });

  test('density-keybind-verbose shows the verbose density chip', async ({ page }) => {
    // Same render as density-verbose but with the file name the goal
    // requires; kept separate so the goal's PNG list is complete.
    await page.goto('/?route=chat&fixture=verbose');
    await expect(page.getByTestId('transcript')).toHaveAttribute('data-density', 'verbose');
    await page.screenshot({ path: shot('density-keybind-verbose'), fullPage: false });
  });

  test('density-keybind-summary shows the summary density chip', async ({ page }) => {
    await page.goto('/?route=chat&fixture=summary');
    await expect(page.getByTestId('transcript')).toHaveAttribute('data-density', 'summary');
    await page.screenshot({ path: shot('density-keybind-summary'), fullPage: false });
  });

  // Wave 4 additions.

  test('chat-live-stream captures an in-flight assistant turn', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat-live-stream'), fullPage: false });
  });

  test('structured-tool-results renders evidence cards instead of raw JSON logs', async ({ page }) => {
    await page.goto('/?route=chat&fixture=structured');
    // The unified renderer detects the JSON result's content type and renders it
    // as flattened scalar evidence (key: value) rather than dumping raw JSON —
    // the nested `records` array is dropped from the preview.
    const result = page
      .getByTestId('assistant-turn-tool')
      .filter({ hasText: 'matched_count' })
      .first();
    await expect(result).toBeVisible();
    const evidence = result.getByTestId('tool-text');
    await expect(evidence).toContainText('matched_count: 72');
    await expect(evidence).not.toContainText('"records"');
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('structured-tool-results'), fullPage: false });
  });

  test('stop-mid-stream shows the Stop affordance in the composer', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming-busy');
    await expect(page.getByTestId('composer-stop')).toBeVisible();
    await page.screenshot({ path: shot('stop-mid-stream'), fullPage: false });
  });

  test('diff-pane-open renders the file_diff review pane', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await expect(page.getByTestId('diff-pane')).toBeVisible();
    await expect(page.getByTestId('diff-pane-hunk-0')).toBeVisible();
    await page.screenshot({ path: shot('diff-pane-open'), fullPage: false });
  });

  test('diff-per-hunk-apply highlights an applied hunk', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await page.getByTestId('diff-pane-apply-0').click();
    await expect(page.locator('.diffpane__hunk--applied')).toBeVisible();
    await page.screenshot({ path: shot('diff-per-hunk-apply'), fullPage: false });
  });

  test('mobile chat keeps the conversation readable without the sessions rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('sessions-column')).toBeHidden();
    await expect(page.getByTestId('transcript-pane')).toBeVisible();
    await expect(page.getByTestId('composer')).toBeVisible();
    await page.screenshot({ path: shot('mobile-chat'), fullPage: false });
  });

  test('mobile diff pane owns the readable content area', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await expect(page.getByTestId('diff-pane')).toBeVisible();
    await expect(page.getByTestId('diff-pane-hunk-0')).toBeVisible();
    await expect(page.getByTestId('diff-pane-apply-0')).toBeVisible();
    await page.screenshot({ path: shot('mobile-diff-pane'), fullPage: false });
  });

  test('agents detail expands into structured routing evidence', async ({ page }) => {
    await page.route('**/v1/agents', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'main',
              title: 'Data Semantics Orchestrator',
              source: 'builtin',
              tier: 1,
              tools: ['delegate'],
              keywords: ['main'],
            },
          ],
        }),
      });
    });
    await page.route('**/v1/agents/main', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'main',
          title: 'Data Semantics Orchestrator',
          source: 'builtin',
          tier: 1,
          specialization: 'workflow routing',
          default_model: 'gpt-oss-120b',
          tools: ['delegate', 'summarize_evidence'],
          keywords: ['main', 'routing'],
          routing_rules: {
            data: 'delegate dataset discovery',
            analysis: 'delegate scientific review',
          },
          metadata: {
            owner: 'bench',
            expert_pack: 'ndp-demo',
            nested: { retained: true },
          },
        }),
      });
    });
    await page.goto('/?route=settings&section=agents');
    await expect(page.getByTestId('agent-card-main')).toBeVisible();
    await page.getByTestId('agent-detail-toggle-main').click();
    await expect(page.getByTestId('agent-detail-main')).toContainText('Routing');
    await expect(page.getByTestId('agent-detail-main')).not.toContainText('routing_rules');
    await page.screenshot({ path: shot('agents-detail-structured'), fullPage: false });
  });

  test('slash-palette opens with the default command list', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=palette');
    await expect(page.getByTestId('slash-palette')).toBeVisible();
    await expect(page.getByTestId('slash-palette-item-help')).toBeVisible();
    await page.screenshot({ path: shot('slash-palette'), fullPage: false });
  });

  test('at-mention-picker opens when the user types `@`', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    const input = page.getByTestId('composer-input');
    await input.click();
    await input.type('explain @sup');
    await expect(page.getByTestId('at-mention-picker')).toBeVisible();
    await page.screenshot({ path: shot('at-mention-picker'), fullPage: false });
  });

  test('attach menu offers upload + workspace reference (gap-96)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await page.getByTestId('composer-attach').click();
    await expect(page.getByTestId('composer-attach-menu')).toBeVisible();
    // Real upload entry (gated on capabilities.attachments_upload, which
    // the fixture advertises) + the @-reference entry side by side.
    await expect(page.getByTestId('composer-attach-upload')).toBeVisible();
    await expect(page.getByTestId('composer-attach-mention')).toBeVisible();
    await page.screenshot({ path: shot('attach-hybrid-menu'), fullPage: false });
  });

  test('fenced code renders as a monospace code block', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    // The single incremental renderer (smd) emits a plain <pre><code> code block
    // (soft chrome: no lang badge / copy button / syntax highlighting).
    await expect(page.locator('.im pre code').first()).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('code-syntax-highlight'), fullPage: false });
  });

  test('markdown file reads render as structured markdown', async ({ page }) => {
    await connectMockBackend(page, 'markdown');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.im h1').filter({ hasText: 'Release Readiness' })).toHaveCount(1);
    await page.locator('.im h1').filter({ hasText: 'Release Readiness' }).scrollIntoViewIfNeeded();
    await expect(page.locator('.im h1').filter({ hasText: 'Release Readiness' })).toBeVisible();
    await expect(page.locator('.im table').first()).toBeVisible();
    const code = page.locator('.im pre code').first();
    await expect(code).toBeVisible();
    await code.scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      return page.evaluate(() => {
        const codeEl = document.querySelector('.im pre code');
        const composer = document.querySelector('[data-testid="composer"]');
        if (!codeEl || !composer) return false;
        const codeBox = codeEl.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        return codeBox.bottom <= composerBox.top - 8;
      });
    }).toBe(true);
    await page.screenshot({ path: shot('markdown-read'), fullPage: false });
  });

  test('EarthScope routing renders the hierarchical agent-execution tree', async ({ page }) => {
    await connectMockBackend(page, 'earthscope');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    // RENDERING_SPEC §9: the projected multi-agent turn renders through the SAME
    // clean AssistantTurnView the persisted path uses — flat, no boxes,
    // depth-indented delegation steps, content-typed tool output. Live ===
    // post-reload. (The old boxed `extree` tree is gone.)
    const turn = page.getByTestId('assistant-turn').first();
    await expect(turn).toBeVisible();
    await turn.scrollIntoViewIfNeeded();
    // The old boxed renderer must NOT be present.
    await expect(page.locator('.extree, [data-testid="execution-tree"]')).toHaveCount(0);

    // Agent names appear as canonical row labels: main delegates to geospatial,
    // then data delegates to earthscope_catalog.
    const headers = turn.getByTestId('assistant-turn-delegation-header');
    await expect(headers.locator('.trx-row__agent', { hasText: /^geospatial$/ }).first()).toBeVisible();
    await expect(
      headers.locator('.trx-row__agent', { hasText: /^earthscope_catalog$/ }).first(),
    ).toBeVisible();
    // The top-level delegation is owned by main.
    await expect(turn.getByTestId('assistant-turn-agent').filter({ hasText: /^main$/ }).first()).toBeVisible();

    // Delegation depth: the data → earthscope_catalog block sits one level
    // deeper than the top-level main → geospatial block (depth via indentation).
    const geoStep = turn.locator('[data-testid="assistant-turn-step"][data-agent="geospatial"]').first();
    const catStep = turn.locator('[data-testid="assistant-turn-step"][data-agent="earthscope_catalog"]').first();
    const geoDepth = Number(await geoStep.getAttribute('data-depth'));
    const catDepth = Number(await catStep.getAttribute('data-depth'));
    expect(catDepth).toBeGreaterThan(geoDepth);

    // The geospatial turn exposes a tool call with content-typed output. Short
    // output renders inline without a raw disclosure; only truncated output
    // gets an expander.
    const toolCall = turn.getByTestId('assistant-turn-tool').filter({ hasText: 'ResolveRegion' }).first();
    await expect(toolCall).toBeVisible();
    await expect(toolCall.getByTestId('tool-text')).toContainText('Resolved Los Angeles');
    await expect(toolCall.getByTestId('tool-raw-toggle')).toHaveCount(0);

    await page.screenshot({ path: shot('earthscope-routing-flow'), fullPage: false });
  });

  test('EarthScope blocker renders as a user-facing workflow blocker', async ({ page }) => {
    await connectMockBackend(page, 'earthscope-blocked');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    const blocker = page.getByTestId('turn-workflow-blocker');
    await expect(blocker).toBeVisible();
    await expect(blocker.getByText('Workflow blocker')).toBeVisible();
    await expect(blocker.getByText(/ndp_dataset_discovery/)).toBeVisible();
    await expect(page.getByTestId('transcript-pane')).toContainText(
      'No station time-series, CSV profile, or PNG artifact was produced.',
    );
    await expect(page.getByTestId('transcript-pane')).toContainText(/required tools were not available/);
    await blocker.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('earthscope-blocked-workflow'), fullPage: false });
  });

  test('command palette fuzzy-matches sparse queries (W3 Tier-1)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=palette');
    await expect(page.getByTestId('slash-palette')).toBeVisible();
    // "dctr" is not a substring of any command, but is a subsequence of
    // "doctor" — fuzzy ranking surfaces it.
    await page.keyboard.type('dctr');
    await expect(page.getByTestId('slash-palette-item-doctor')).toBeVisible({ timeout: 4_000 });
    await page.screenshot({ path: shot('slash-palette-fuzzy'), fullPage: false });
  });

  test('retry variant menu offers notes + model options (1.0 item 4)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // The per-message action row appears on hover; the regenerate action
    // opens the variant menu (plain / with notes / with model).
    await page.getByTestId('msg-m-asst-1').hover();
    await page.getByTestId('msg-regen-m-asst-1').click();
    await expect(page.getByTestId('regen-menu-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-plain-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-notes-m-asst-1')).toBeVisible();
    await expect(page.getByTestId('regen-model-m-asst-1')).toBeVisible();
    await page.screenshot({ path: shot('retry-menu-open'), fullPage: false });
    // The with-model submenu lists the available models.
    await page.getByTestId('regen-model-m-asst-1').click();
    await expect(
      page.getByTestId('regen-pick-anthropic:claude-opus-4-m-asst-1'),
    ).toBeVisible();
    await expect(
      page.getByTestId('regen-pick-argonne_metis:gpt-oss-120b-m-asst-1'),
    ).toBeVisible();
    await page.screenshot({ path: shot('retry-model-submenu'), fullPage: false });
  });

  test('inline images + retry lineage render in the transcript (1.0 items 2+3)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=previews');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // Base64 image part renders as a real <img>.
    await expect(page.getByTestId('trx-image')).toBeVisible();
    // Backend file references get an honest placeholder, not a broken img.
    await expect(page.getByTestId('trx-image-unavailable')).toBeVisible();
    // The retry-created user message carries the lineage chip.
    await expect(page.getByTestId('msg-retry-chip-m-user-retry')).toBeVisible();
    await page.screenshot({ path: shot('previews-and-retry'), fullPage: false });
  });

  test('preview rail explains image artifact decode failures', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.preview-rail-open.v1', 'true');
      window.localStorage.setItem('clio.inspector-open.v1', 'false');
    });
    await connectMockBackend(page, 'markdown');
    await expect(page.getByTestId('preview-rail')).toBeVisible();
    await page.getByTestId('preview-rail-filter').fill('validation_plot');
    await page.getByTestId('preview-rail-row-plots/validation_plot.png').click();
    await expect(page.getByTestId('preview-rail-image-error')).toContainText('JSON/text');
    await expect(page.getByTestId('preview-rail-image-error')).toContainText('read, 68 B listed');
    await page.screenshot({ path: shot('preview-image-decode-diagnostic'), fullPage: false });
  });

  test('inspector execution timeline renders turn events (1.0 item 5)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal&open=inspector');
    await expect(page.getByTestId('inspector-drawer')).toBeVisible();
    await page.getByTestId('inspector-tab-timeline').click();
    await expect(page.getByTestId('inspector-timeline')).toBeVisible();
    // The fixture turn: started → tool (ReadFile) → response text → diff,
    // in part order (the wire guarantees order; only real data is shown).
    await expect(page.getByTestId('timeline-event-started')).toBeVisible();
    await expect(page.getByTestId('timeline-event-tool')).toBeVisible();
    await expect(page.getByTestId('timeline-event-text')).toBeVisible();
    await expect(page.getByTestId('timeline-event-diff')).toBeVisible();
    await page.screenshot({ path: shot('inspector-timeline'), fullPage: false });
  });

  test('full-data transcript renders telemetry, routing detail, and every part type', async ({
    page,
  }) => {
    await connectMockBackend(page, 'fulldata');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
    // The v0.2 full-data surfaces must actually render, not merely be typed:
    await expect(page.getByTestId('tool-telemetry').first()).toBeVisible();
    await expect(page.getByTestId('app-version-badge')).toBeVisible();
    await page.screenshot({ path: shot('full-data-transcript'), fullPage: true });
  });

  test('light theme renders the chat shell on the light palette (1.0 item 1)', async ({ page }) => {
    // Seeding the mode flag is all it takes — theme.ts initTheme() applies
    // the full light palette on module load (same path a real user's
    // persisted choice takes on app start).
    await page.addInitScript(() => {
      window.localStorage.setItem('clio.theme.mode.v1', 'light');
    });
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // The page background actually IS the light token, not the dark default.
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    );
    expect(bg).toBe('#f7f9fc');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('light-theme-chat'), fullPage: false });
    // Code blocks + diffs restyle through the override tokens too.
    await page.goto('/?route=chat&fixture=normal&open=diff');
    await expect(page.getByTestId('diff-pane')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('light-theme-diff'), fullPage: false });
  });

  test('notification center searches + filters history (1.0 item 8)', async ({ page }) => {
    await page.goto('/?route=chat&fixture=normal');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    // Fixture mode seeds 5 silent history entries → unseen badge shows.
    await expect(page.getByTestId('notification-badge')).toBeVisible();
    await page.getByTestId('notification-bell').click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Send failed')).toBeVisible();
    await expect(panel.getByText(/responded/)).toBeVisible();
    await page.screenshot({ path: shot('notification-center'), fullPage: false });
    // Search narrows to the matching entry.
    await page.getByTestId('notification-search').fill('fail');
    await expect(panel.getByText('Send failed')).toBeVisible();
    await expect(panel.getByText(/responded/)).toHaveCount(0);
    await page.screenshot({ path: shot('notification-center-search'), fullPage: false });
    // Tone chip filters by kind (clear search first).
    await page.getByTestId('notification-search').fill('');
    await page.getByTestId('notification-tone-warn').click();
    await expect(panel.getByText('Permission requested')).toBeVisible();
    await expect(panel.getByText('Send failed')).toHaveCount(0);
    await page.screenshot({ path: shot('notification-center-filtered'), fullPage: false });
  });

  // ----- Real-backend visual proofs below this line -----
  //
  // Each live test self-skips when no clio-agent-gact is reachable
  // (default 127.0.0.1:17800), so CI runners without a backend skip
  // them while still RUNNING the fixture tests above. NOTE: a bare
  // `test.skip(condition, …)` at describe-body level marks the WHOLE
  // describe — fixture tests included — as conditionally skipped
  // (that bug made CI verify nothing); the skip must live inside each
  // live test body.

  // ----- Discovery pages backed by the live clio-agent-gact -----
  test('discovery-agents lists the tier-1/2 agent catalog', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await openSettingsSection(page, 'agents');
      await expect(page.getByTestId('dp-agents')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('discovery-agents'), fullPage: false });
    });
  });

  test('discovery-mcp lists the MCP servers + their tool counts', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await openSettingsSection(page, 'mcp');
      await expect(page.getByTestId('dp-mcp-servers')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('discovery-mcp'), fullPage: false });
    });
  });

  test('discovery-doctor renders integration statuses from /v1/health', async ({
    browser,
  }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await openSettingsSection(page, 'doctor');
      await expect(page.getByTestId('dp-doctor')).toBeVisible();
      await expect(page.getByTestId('doctor-integrations')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('discovery-doctor'), fullPage: false });
    });
  });

  test('settings-providers shows the active LM + Use as LM buttons', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await page.getByTestId('sessions-settings').click();
      await page.getByTestId('settings-nav-providers').click();
      await expect(page.getByTestId('providers-active')).toBeVisible({ timeout: 4_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('settings-providers'), fullPage: false });
    });
  });

  test('settings-shell-about shows the About section', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      // Open Settings via rail
      await page.getByTestId('sessions-settings').click();
      await expect(page.getByTestId('settings-shell')).toBeVisible();
      await page.getByTestId('settings-nav-about').click();
      await expect(page.getByTestId('settings-about')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('settings-shell-about'), fullPage: false });
    });
  });

  test('settings theme buttons switch light/dark live (1.0 item 1)', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await page.getByTestId('sessions-settings').click();
      await page.getByTestId('settings-nav-appearance').click();
      await expect(page.getByTestId('settings-appearance')).toBeVisible();
      // Click Light → the page flips to the light palette immediately.
      await page.getByTestId('settings-theme-light').click();
      const bgLight = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
      );
      expect(bgLight).toBe('#f7f9fc');
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot('settings-light-theme'), fullPage: false });
      // Back to Dark → overrides clear to the design-system default.
      await page.getByTestId('settings-theme-dark').click();
      const bgDark = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
      );
      expect(bgDark).toBe('#000000');
    });
  });

  test('settings-data section exports preferences (1.0 item 7)', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await page.getByTestId('sessions-settings').click();
      await page.getByTestId('settings-nav-data').click();
      await expect(page.getByTestId('settings-data')).toBeVisible();
      await expect(page.getByTestId('settings-export-btn')).toBeVisible();
      await expect(page.getByTestId('settings-import-btn')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('settings-data-section'), fullPage: false });
      // Export triggers a real browser download of the versioned envelope.
      const downloadP = page.waitForEvent('download');
      await page.getByTestId('settings-export-btn').click();
      const download = await downloadP;
      expect(download.suggestedFilename()).toMatch(/^clio-settings-.*\.json$/);
      await page.screenshot({ path: shot('settings-data-exported'), fullPage: false });
    });
  });

  test('settings-shell-appearance shows theme + density choices', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await page.getByTestId('sessions-settings').click();
      await page.getByTestId('settings-nav-appearance').click();
      await expect(page.getByTestId('settings-appearance')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('settings-shell-appearance'), fullPage: false });
    });
  });

  test('discovery-metrics shows the metrics dashboard', async ({ browser }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await openSettingsSection(page, 'metrics');
      await expect(page.getByTestId('dp-metrics')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('discovery-metrics'), fullPage: false });
    });
  });

  test('chat-shell-real-backend captures the live connect → chat flow', async ({
    browser,
  }) => {
    test.skip(
      !realBackendReachable,
      `no clio-agent-gact on ${REAL_BACKEND} — live-backend proof skipped`,
    );
    await withRealBackendPage(browser, async (page) => {
      await expect(page.getByTestId('sessions-connection-status')).toBeVisible({
        timeout: 8_000,
      });
      await expect(page.getByTestId('sse-status-chip')).toHaveCount(0);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: shot('chat-shell-real-backend'),
        fullPage: false,
      });
    });
  });
});
