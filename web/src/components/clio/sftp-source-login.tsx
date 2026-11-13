import type { ConnectedSourceState, SftpCredentials } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { SftpAuthenticationFields } from './sftp-authentication-fields';
import { t } from '@lingui/core/macro';

/** Re-authenticate after restart without recreating a source or losing its snapshots. */
const { agent } = vocab;

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
        hostLabel={t`the connected ${agent}`}
        value={credentials}
        onChange={setCredentials}
      />
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? t`Connecting…` : t({ message: 'Connect', context: 'verb' })}
      </Button>
      {login.error && (
        <p role="alert" className="text-sm text-destructive">
          {login.error.message}
        </p>
      )}
    </form>
  );
}
