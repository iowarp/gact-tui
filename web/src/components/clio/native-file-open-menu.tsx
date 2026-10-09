import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { documentApplications, openFileBytes } from '@/tauri/documents';
import { AssociatedApplicationItems } from './associated-application-items';
import {
  fileViewerIdentity,
  readFileViewerBytes,
  type FileViewerSource,
} from './file-viewer-source';

/** All file viewers can open their original bytes with that format's desktop handlers. */
export function NativeFileOpenMenu({ source }: { source: FileViewerSource }) {
  const repository = useRepository();
  const identity = fileViewerIdentity(source);
  const native = inTauri();
  const applications = useQuery({
    queryKey: ['document-applications', identity.name, identity.mediaType],
    queryFn: () => documentApplications(identity.name, identity.mediaType),
    enabled: native && identity.available,
    staleTime: 60_000,
  });
  const open = useMutation({
    mutationFn: async (id: string) =>
      openFileBytes(
        identity.name.split(/[\\/]/u).at(-1)!,
        await readFileViewerBytes(repository, source),
        id,
      ),
    onSuccess: () => toast.success('Opened a desktop copy of the file.'),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!native) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          disabled={!identity.available}
          aria-label="Open in"
        >
          Open in <ChevronDownIcon aria-hidden="true" className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 max-w-72">
        <AssociatedApplicationItems
          applications={applications.data ?? []}
          pending={applications.isPending}
          error={applications.error?.message}
          disabled={open.isPending}
          onSelect={(app) => open.mutate(app.id)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
