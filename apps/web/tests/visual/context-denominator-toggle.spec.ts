/**
 * Regression lock for fix (b): the ContextPanel legend's percentage-denominator
 * toggle ("of used" ↔ "of capacity").
 *
 * The segmented bar's block WIDTHS are always of-used composition, but the
 * legend NUMBERS can be read against two denominators (see
 * ContextUsageModel.segmentFraction / ContextUsageBar's `denom` signal):
 *   - 'of used'     — each category ÷ the attributed-used total  (the default;
 *                     the numbers sum to ~100% across categories).
 *   - 'of capacity' — each category ÷ the full context window; the numbers sum
 *                     to the headline fullness %, and each is ≤ its of-used value
 *                     (because used_total ≤ window).
 *
 * This locks: (1) 'of used' is the active default, (2) clicking 'of capacity'
 * switches the active control AND re-bases the displayed percentages, (3)
 * clicking back to 'of used' restores them exactly.
 *
 * Runs against the in-process mock backend (mock-backend.ts). The earthscope
 * case's default scope resolves to the `__default__` category shape in
 * mock-backend-fixtures.ts: 9 non-empty categories, attributed-used total =
 * used_tokens = 123_500 tokens against a 200_000 window (fullness ≈ 62%). The
 * assertions below are grounded in the toggle's INVARIANTS, not hardcoded
 * fixture magnitudes: of-used sums to ~100, of-capacity sums to ~fullness, and
 * of-capacity ≤ of-used per category — all provable from used_total ≤ window and
 * used_tokens == categoryTotal.
 */
import { test, expect } from '@playwright/test';
import { connectMockBackend } from './mock-backend';

// The 9 non-empty categories of the default working set (mock-backend-fixtures
// CONTEXT_CATEGORY_SHAPES.__default__), in the stable ContextUsageModel order.
const CATEGORIES = [
  'system',
  'messages',
  'tools',
  'tool_calls',
  'reasoning',
  'observations',
  'summary',
  'io',
  'framing',
] as const;

test.describe('context panel — percentage denominator toggle', () => {
  test('of-capacity is the default; of-used re-bases; back to of-capacity restores', async ({
    page,
  }) => {
    // Boot the mock chat and open the ContextFooter → context-overlay →
    // context-panel (same flow as context-view.spec.ts).
    await connectMockBackend(page, 'earthscope');
    await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });

    const footer = page.getByTestId('context-footer');
    await expect(footer).toBeVisible({ timeout: 8_000 });
    await footer.click();

    await expect(page.getByTestId('context-overlay')).toBeVisible({ timeout: 4_000 });
    const panel = page.getByTestId('context-panel');
    await expect(panel).toBeVisible();

    const legend = panel.getByTestId('context-usage-legend');
    await expect(legend).toBeVisible({ timeout: 4_000 });

    // The bar must be fully segmented into the 9 default categories before we
    // read any percentages (the state resource loads async).
    const legendRows = legend.locator('[data-testid^="context-legend-"]');
    await expect.poll(() => legendRows.count(), { timeout: 6_000 }).toBe(CATEGORIES.length);

    // Toggle controls + the mode label + the headline fullness %, all grounded
    // in ContextUsageBar.tsx (data-testids: context-usage-denom{,-used,-window},
    // context-usage-pct; active class ctx-toggle__btn--active; aria-pressed).
    const usedBtn = panel.getByTestId('context-usage-denom-used');
    const capacityBtn = panel.getByTestId('context-usage-denom-window');
    const denomLabel = panel.getByTestId('context-usage-denom');
    const fullnessPct = panel.getByTestId('context-usage-pct');

    // Read the per-category legend percentages into a {key: int} map. Each row's
    // percent lives in the `.ctx-legend__pct` span (e.g. "52%").
    const readPercents = async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      for (const key of CATEGORIES) {
        const text = (
          await panel.getByTestId(`context-legend-${key}`).locator('.ctx-legend__pct').innerText()
        ).trim();
        out[key] = Number.parseInt(text.replace('%', ''), 10);
      }
      return out;
    };
    const total = (m: Record<string, number>): number =>
      Object.values(m).reduce((a, b) => a + b, 0);
    const readFullness = async (): Promise<number> =>
      Number.parseInt((await fullnessPct.innerText()).trim().replace('%', ''), 10);

    // ---- (1) 'of capacity' is ACTIVE by default ---------------------------
    // window_tokens > 0 in this fixture, so of-capacity is available and is the
    // mode the panel opens in (it answers "how full is my context window?").
    await expect(capacityBtn).toBeEnabled();
    await expect(capacityBtn).toHaveClass(/ctx-toggle__btn--active/);
    await expect(capacityBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(usedBtn).not.toHaveClass(/ctx-toggle__btn--active/);
    await expect(usedBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(denomLabel).toHaveText('% of capacity');

    const capacityPercents = await readPercents();
    // of-capacity percentages sum to the headline fullness %, NOT to 100
    // (categoryTotal == used_tokens, so Σ(tokens/window) == used_pct).
    const fullness = await readFullness();
    const capacitySum = total(capacityPercents);
    expect(
      Math.abs(capacitySum - fullness),
      `of-capacity sum ${capacitySum} vs fullness ${fullness}`,
    ).toBeLessThanOrEqual(5);

    // ---- (2) click 'of used' → active mode + composition percentages -------
    await usedBtn.click();
    await expect(usedBtn).toHaveClass(/ctx-toggle__btn--active/);
    await expect(usedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(capacityBtn).not.toHaveClass(/ctx-toggle__btn--active/);
    await expect(capacityBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(denomLabel).toHaveText('% of used');

    const usedPercents = await readPercents();
    // Every non-empty category shows a positive of-used percent.
    for (const key of CATEGORIES) {
      expect(usedPercents[key], `of-used ${key}`).toBeGreaterThan(0);
    }
    // of-used percentages are a composition breakdown: they sum to ~100%
    // (integer-rounding noise across 9 rows keeps the sum within ±5 of 100).
    const usedSum = total(usedPercents);
    expect(Math.abs(usedSum - 100), `of-used sum was ${usedSum}`).toBeLessThanOrEqual(5);

    // The two denominators are genuinely distinct + re-based, not re-rendered:
    // each category's of-capacity percent is ≤ its of-used percent (dividing by
    // the larger window denominator; used_total ≤ window makes this an invariant
    // preserved by monotonic rounding), and the dominant category actually drops.
    for (const key of CATEGORIES) {
      const cap = capacityPercents[key];
      const used = usedPercents[key];
      expect(cap, `of-capacity ${key} percent present`).toBeDefined();
      expect(used, `of-used ${key} percent present`).toBeDefined();
      expect(
        cap as number,
        `of-capacity ${key} (${cap}) must be ≤ of-used (${used})`,
      ).toBeLessThanOrEqual(used as number);
    }
    const capMessages = capacityPercents['messages'];
    const usedMessages = usedPercents['messages'];
    expect(capMessages, 'of-capacity messages percent present').toBeDefined();
    expect(usedMessages, 'of-used messages percent present').toBeDefined();
    expect(capMessages as number).toBeLessThan(usedMessages as number);
    // capacity total sits well below the of-used ~100 total (session ~62% full).
    expect(capacitySum).toBeLessThan(90);
    expect(usedSum).toBeGreaterThan(95);
    expect(usedSum - capacitySum).toBeGreaterThan(20);

    // ---- (3) click back to 'of capacity' → percentages restored exactly ----
    await capacityBtn.click();
    await expect(capacityBtn).toHaveClass(/ctx-toggle__btn--active/);
    await expect(capacityBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(usedBtn).not.toHaveClass(/ctx-toggle__btn--active/);
    await expect(usedBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(denomLabel).toHaveText('% of capacity');

    const restored = await readPercents();
    expect(restored).toEqual(capacityPercents);
  });
});
