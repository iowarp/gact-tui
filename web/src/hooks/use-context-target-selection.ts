import { useCallback, useState } from 'react';

interface ContextTargetSelection {
  sessionId: string;
  targetId: string;
}

export function useContextTargetSelection(
  sessionId: string,
): readonly [targetId: string, selectTarget: (targetId: string) => void] {
  const [selection, setSelection] = useState<ContextTargetSelection>({
    sessionId,
    targetId: sessionId,
  });
  const targetId = selection.sessionId === sessionId ? selection.targetId : sessionId;
  const selectTarget = useCallback(
    (nextTargetId: string) => setSelection({ sessionId, targetId: nextTargetId }),
    [sessionId],
  );
  return [targetId, selectTarget] as const;
}
