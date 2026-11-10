import { expect, test } from '@playwright/test';

// gact-tui#834: a parent's assignment with a long path was wider than its
// bubble, and the end-aligned column pushed the overflow off the left edge,
// clipping each line's start and the Show more control.
test('a parent assignment with a long path stays inside its bubble at every width', async ({
  page,
}, testInfo) => {
  for (const theme of ['dark', 'light']) {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/tests/review/parent-delegation.html?theme=${theme}`);
      const bubble = page.locator('[data-slot="parent-delegation-bubble"]');
      await expect(bubble).toContainText('/Users/jaime/Library/Application');
      const showMore = bubble.getByRole('button', { name: 'Show more' });
      await expect(showMore).toBeVisible();
      for (const expanded of [false, true]) {
        if (expanded) await showMore.click();
        const spills = await bubble.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const left = box.left + parseFloat(style.paddingLeft) - 1;
          const right = box.right - parseFloat(style.paddingRight) + 1;
          const escaped: string[] = [];
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const rect of range.getClientRects())
              if (rect.width && (rect.left < left || rect.right > right))
                escaped.push(text.textContent!.slice(0, 32));
          }
          return escaped;
        });
        expect(spills, `${theme} ${viewport.width} expanded=${expanded}`).toEqual([]);
      }
      await expect(bubble).toContainText('report every discrepancy');
      // The bubble is a person's prompt: right-aligned and capped like one.
      const [frame, pane] = await Promise.all([
        page.locator('[data-slot="parent-delegation-frame"]').boundingBox(),
        page.getByRole('region', { name: 'Subagent tab' }).boundingBox(),
      ]);
      expect(frame!.width).toBeLessThan(pane!.width * 0.86);
      expect(pane!.x + pane!.width - (frame!.x + frame!.width)).toBeLessThan(64);
      await page.screenshot({
        path: testInfo.outputPath(`parent-delegation-${theme}-${viewport.width}.png`),
      });
    }
  }
});
