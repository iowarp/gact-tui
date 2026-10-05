import type { ConnectedSourceState, SftpCredentials } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { SftpAuthenticationFields } from './sftp-authentication-fields';

/** Re-authenticate after restart without recreating a source or losing its snapshots. */
export function SftpSourceLogin({
  workspaceId,
  source,
  onComplete,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  onComplete: () => void;
}) {
  const repository = useRepository();
  const [credentials, setCredentials] = useState<SftpCredentials>(
    source.configuration.ssh_authentication === 'password' ? { password: '' } : {},
  );
  const login = useMutation({
    mutationFn: () => repository.signInSftpSource(workspaceId, source.id, credentials),
    onSuccess: () => {
      setCredentials({});
      onComplete();
    },
  });
  return (
    <form
      className="space-y-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        login.mutate();
      }}
    >
      <SftpAuthenticationFields
        hostLabel={`the connected ${vocab.agent}`}
        value={credentials}
        onChange={setCredentials}
      />
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Connecting…' : 'Connect'}
      </Button>
      {login.error && (
        <p role="alert" className="text-sm text-destructive">
          {login.error.message}
        </p>
      )}
    </form>
  );
}
