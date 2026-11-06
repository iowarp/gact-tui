import { useState } from 'react';
import { toast } from 'sonner';

/**
 * The person's SPOTTER model pick in this mount, until the session reports a different
 * one. `set` stores it through `onChange` and reverts with a toast when refused.
 */
export function useSpotterModelSelection(
  stored: string,
  onChange?: (ref: string) => Promise<void>,
): { value: string; set: (next: string) => void } {
  const [selection, setSelection] = useState({ value: stored, authoritative: stored });
  const value = selection.authoritative === stored ? selection.value : stored;
  const set = (next: string) => {
    if (next === value) return;
    setSelection({ value: next, authoritative: stored });
    if (!onChange) return;
    void onChange(next).catch((error: unknown) => {
      setSelection({ value, authoritative: stored });
      toast.error('SPOTTER model was not changed', {
        description: error instanceof Error ? error.message : 'The service rejected the change.',
      });
    });
  };
  return { value, set };
}
