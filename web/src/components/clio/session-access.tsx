import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, ShieldIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const permissions = [
  {id: 'read', label: 'Read assignments and results'},
  {id: 'observe', label: 'Observe progress and wait'},
  {id: 'message', label: 'Send messages'},
  {id: 'control', label: 'Pause, restart and cancel'},
] as const;
type Right = (typeof permissions)[number]['id'];

/** Human-created relationships keep observation, messaging and control separate. */
export function SessionAccess({sessionId}: {sessionId: string}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [rights, setRights] = useState<Right[]>(['read', 'observe', 'message']);
  const [descendants, setDescendants] = useState(false);
  const repository = useRepository();
  const queryClient = useQueryClient();
  const {settings} = useConnectionSettings();
  const grantKey = ['session-access', settings.endpoint, sessionId] as const;
  const grants = useQuery({queryKey: grantKey, enabled: open,
    queryFn: ({signal}) => repository.coordinationGrants(sessionId, signal)});
  const sessions = useQuery({queryKey: ['session-access-targets', settings.endpoint], enabled: open,
    queryFn: async ({signal}) => {
      const workspaces = await repository.workspaces(signal);
      const groups = await Promise.all(workspaces.map(async (workspace) => ({workspace,
        sessions: await repository.sessions(workspace.id, signal)})));
      return groups.flatMap(({workspace, sessions}) => sessions.map((session) => ({
        id: session.id, title: session.title, workspace: workspace.display_name || workspace.name})));
    }});
  const grant = useMutation({mutationFn: () => repository.grantSessionAccess(sessionId, target, rights, descendants),
    onSuccess: async () => {setTarget(''); await queryClient.invalidateQueries({queryKey: grantKey});}});
  const revoke = useMutation({mutationFn: (identity: string) => repository.revokeSessionAccess(sessionId, identity),
    onSuccess: async () => {await queryClient.invalidateQueries({queryKey: grantKey});}});
  const active = grants.data?.filter((row) => !row.revoked_at) ?? [];
  const error = grants.error || sessions.error || grant.error || revoke.error;
  const busy = grant.isPending || revoke.isPending;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t py-2">
      <CollapsibleTrigger className="group flex min-h-9 w-full cursor-pointer items-center gap-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ShieldIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Access to other sessions</span>
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pb-2 text-sm">
        <p className="text-xs text-muted-foreground">Choose what this session’s agent can do in another conversation.</p>
        {active.length ? <ul className="space-y-2" aria-label="Current session access">
          {active.map((row) => <li key={row.id} className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate">{sessions.data?.find((session) => session.id === row.target_session)?.title || 'Session unavailable'}</p>
              <p className="text-xs text-muted-foreground">{row.rights.map((right) => ({read: 'Read', observe: 'Observe', message: 'Message', control: 'Control'})[right]).join(', ')}{row.target_scope === 'tree' ? ' · Includes children' : ''}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke.mutate(row.id)}>Revoke</Button>
          </li>)}
        </ul> : null}
        <label className="block space-y-1">
          <span>Allow access to</span>
          <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy || sessions.isPending}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="">Choose a conversation</option>
            {sessions.data?.filter((session) => session.id !== sessionId).map((session) =>
              <option key={session.id} value={session.id}>{session.title} — {session.workspace}</option>)}
          </select>
        </label>
        {target ? <>
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="sr-only">Allowed actions</legend>
            {permissions.map(({id, label}) => <label key={id} className="flex min-h-8 cursor-pointer items-center gap-2">
              <Checkbox checked={rights.includes(id)} onCheckedChange={(checked) => setRights((previous) => checked === true ? [...previous.filter((value) => value !== id), id] : previous.filter((value) => value !== id))} />
              <span>{label}</span>
            </label>)}
            <label className="flex min-h-8 cursor-pointer items-center gap-2">
              <Checkbox checked={descendants} onCheckedChange={(checked) => setDescendants(checked === true)} />
              <span>Include delegated children</span>
            </label>
          </fieldset>
          {rights.includes('control') ? <p className="text-xs text-muted-foreground">Control includes cancelling that agent’s descendant work.</p> : null}
          <Button size="sm" disabled={busy || !rights.length} onClick={() => grant.mutate()}>{grant.isPending ? 'Granting access…' : 'Grant access'}</Button>
        </> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : 'Unable to update session access.'}</p> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
