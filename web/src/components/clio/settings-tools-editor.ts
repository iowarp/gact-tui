import type { ToolRule, ToolSettingsUpdate } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

export type RowStatus = { kind: 'saved' } | { kind: 'error'; message: string };

export interface ToolEditor {
  /** Per tool name: ✓ for 2 s after a save, or the error until the next success. */
  status: Record<string, RowStatus>;
  busy: ReadonlySet<string>;
  save: (update: ToolSettingsUpdate) => void;
  removeRule: (tool: string, rule: ToolRule) => void;
}

/** Saves at once; each row shows its own ✓ or error. */
export function useToolSettingsEditor(): ToolEditor {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const run = useCallback(
    async (names: string[], failure: string, action: () => Promise<unknown>) => {
      setBusy((current) => new Set([...current, ...names]));
      try {
        await action();
        void queryClient.invalidateQueries({ queryKey: ['tool-settings', scope] });
        setStatus((current) => {
          const next = { ...current };
          for (const name of names) next[name] = { kind: 'saved' };
          return next;
        });
        for (const name of names) {
          window.clearTimeout(timers.current.get(name));
          timers.current.set(
            name,
            window.setTimeout(() => {
              timers.current.delete(name);
              setStatus((current) => {
                if (current[name]?.kind !== 'saved') return current;
                const { [name]: _done, ...rest } = current;
                return rest;
              });
            }, 2000),
          );
        }
      } catch (error) {
        const message = `${failure}: ${error instanceof Error ? error.message : String(error)}`;
        setStatus((current) => {
          const next = { ...current };
          for (const name of names) next[name] = { kind: 'error', message };
          return next;
        });
      } finally {
        setBusy((current) => new Set([...current].filter((name) => !names.includes(name))));
      }
    },
    [queryClient, scope],
  );
  const save = useCallback(
    (update: ToolSettingsUpdate) =>
      void run(update.tools, 'Not saved', () => repository.updateToolSettings(update)),
    [repository, run],
  );
  const removeRule = useCallback(
    (tool: string, rule: ToolRule) =>
      void run([tool], 'Rule not removed', () => repository.removeToolRule(tool, rule)),
    [repository, run],
  );
  return { status, busy, save, removeRule };
}
