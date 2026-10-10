import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreEvidenceFocus } from './evidence-focus';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function closingPanel(interactedOutside = false) {
  const launcher = document.createElement('button');
  const panel = document.createElement('div');
  const close = document.createElement('button');
  const composer = document.createElement('div');
  composer.contentEditable = 'true';
  composer.tabIndex = 0;
  panel.append(close);
  document.body.append(launcher, panel, composer);
  const event = new Event('closeAutoFocus', { cancelable: true });
  panel.addEventListener(event.type, (event) =>
    restoreEvidenceFocus(event, launcher, interactedOutside),
  );
  return { launcher, panel, close, composer, event };
}

describe('evidence close focus', () => {
  it('returns to the launcher after the focused close control unmounts', () => {
    const { launcher, panel, close, event } = closingPanel();
    close.focus();
    panel.remove();
    panel.dispatchEvent(event);
    expect(launcher).toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });

  it('preserves composer focus chosen before deferred close autofocus runs', () => {
    vi.useFakeTimers();
    const { launcher, panel, close, composer, event } = closingPanel();
    close.focus();
    panel.remove();
    window.setTimeout(() => panel.dispatchEvent(event), 0);
    composer.focus();
    vi.runAllTimers();
    expect(composer).toHaveFocus();
    expect(launcher).not.toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not restore the launcher when outside interaction dismissed the panel', () => {
    const { launcher, panel, close, event } = closingPanel(true);
    close.focus();
    panel.remove();
    panel.dispatchEvent(event);
    expect(launcher).not.toHaveFocus();
    expect(event.defaultPrevented).toBe(true);
  });
});
