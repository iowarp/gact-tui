import type { MessageDelivery, RunState } from '@clio/core/v3';
import { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';

/** Queue while work runs; modifier feedback steers it. Paused/idle sessions send normally. */
export function composerDelivery(state: RunState, modifier: boolean): MessageDelivery | 'queued' {
  return state === 'running' ? (modifier ? 'steer' : 'queued') : 'start';
}

/** Keep the visible action in sync with Ctrl/Cmd, clearing a stuck modifier on blur. */
export function useComposerDelivery(state: RunState) {
  const [modifier, setModifier] = useState(false);
  useEffect(() => {
    const update = (event: KeyboardEvent) => setModifier(event.ctrlKey || event.metaKey);
    const clear = () => setModifier(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('blur', clear);
    };
  }, []);
  const delivery = composerDelivery(state, modifier);
  return {
    delivery,
    label: delivery === 'queued' ? t`Queue` : delivery === 'steer' ? t`Steer` : t`Send`,
  };
}
