import { useMutation } from '@tanstack/react-query';
import { t } from '@lingui/core/macro';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';

/**
 * On a running foreground script: moves it, still running, to a background task. The
 * agent's call returns with the task's handle and the agent goes on; the script keeps
 * its variables and shows under Work, Background tasks.
 */
export function SendScriptToBackground({ sessionId }: { sessionId: string }) {
  const repository = useRepository();
  const move = useMutation({
    mutationFn: () => repository.sendScriptsToBackground(sessionId),
    onSuccess: (moved) => {
      if (!moved) toast.info(t`The script had already finished or moved.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 px-2 text-meta"
      data-slot="send-script-to-background"
      disabled={move.isPending || move.isSuccess}
      onClick={(event) => {
        event.stopPropagation(); // the row's own toggle stays as it is
        move.mutate();
      }}
    >
      {move.isSuccess ? t`Moved to the background` : t`Send to background`}
    </Button>
  );
}
