import type { SavedMcpService } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZapIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

function target(service: SavedMcpService): string {
  const spec = service.spec;
  if (service.transport === 'http') return String(spec.url ?? '');
  const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
  return [String(spec.command ?? ''), ...args].join(' ');
}

/**
 * The MCP services the person saved, here or with `clio-agent mcp add`: what
 * each runs, whether every conversation gets it, and a way to remove it.
 */
export function SavedMcpServices() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [removing, setRemoving] = useState<SavedMcpService>();
  const saved = useQuery({
    queryKey: queryKeys.key('mcp-configurations', settings.endpoint),
    queryFn: ({ signal }) => repository.savedMcpServices(signal),
  });
  const remove = useMutation({
    mutationFn: (service: SavedMcpService) => repository.removeMcpConfiguration(service.name),
    onSuccess: async (_value, service) => {
      setRemoving(undefined);
      await Promise.all(
        (['mcp-configurations', 'mcp-servers', 'tools'] as const).map((key) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
        ),
      );
      toast.success(`Removed ${service.name}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!saved.data?.length) return null;
  return (
    <section aria-label="Your MCP services" className="grid gap-2">
      <h2 className="text-sm font-semibold">Your MCP services</h2>
      <ul className="grid gap-2">
        {saved.data.map((service) => (
          <li className="flex min-w-0 items-start gap-3 rounded-lg border p-3" key={service.name}>
            <PlugZapIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{service.name}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {target(service)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {service.transport === 'http' ? 'Remote service' : 'Local command'},{' '}
                {service.always_load
                  ? 'available in every conversation'
                  : 'available when a conversation asks for it'}
              </p>
            </div>
            <Button onClick={() => setRemoving(service)} size="sm" variant="ghost">
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog
        onOpenChange={(open) => (open ? undefined : setRemoving(undefined))}
        open={Boolean(removing)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              New conversations no longer get its tools. A conversation using it now keeps it until
              its turn ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (removing) remove.mutate(removing);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
