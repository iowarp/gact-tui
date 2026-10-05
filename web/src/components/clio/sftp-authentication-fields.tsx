import type { SftpCredentials } from '@clio/core/v3';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoTip } from './info-tip';

/** Browser credentials go only to the connected CLIO, never to native Desktop commands. */
export function SftpAuthenticationFields({
  hostLabel,
  value,
  onChange,
}: {
  hostLabel: string;
  value: SftpCredentials;
  onChange: (credentials: SftpCredentials) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const pendingRead = useRef<FileReader | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const password = value.password !== undefined;
  useEffect(() => () => pendingRead.current?.abort(), []);
  return (
    <Field>
      <FieldLabel className="flex items-center gap-2">
        Authentication
        <InfoTip label="About browser SFTP authentication">
          Connects from {hostLabel}. A selected key or password is sent privately to this{' '}
          {vocab.agent}{' '}
          and kept in memory until disconnect or restart. It is never included in the conversation.
          Without a selected key, this host's configured keys or SSH agent are used. Interactive
          Duo/2FA, security-key prompts and Kerberos require {vocab.product}.
        </InfoTip>
      </FieldLabel>
      <RadioGroup
        className="flex gap-5"
        value={password ? 'password' : 'key'}
        onValueChange={(mode) => {
          pendingRead.current?.abort();
          pendingRead.current = null;
          onChange(mode === 'password' ? { password: '' } : {});
          setFilename('');
          setError('');
          if (input.current) input.current.value = '';
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="key" />
          SSH key
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="password" />
          Password
        </label>
      </RadioGroup>
      {password ? (
        <Input
          aria-label="SSH password"
          type="password"
          autoComplete="off"
          value={value.password ?? ''}
          onChange={(event) => onChange({ password: event.target.value })}
        />
      ) : (
        <>
          <input
            ref={input}
            id={`${id}-file`}
            className="hidden"
            type="file"
            aria-label="SSH private key file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              pendingRead.current?.abort();
              pendingRead.current = null;
              if (file.size > 1024 * 1024) {
                setError('Choose an SSH key file smaller than 1 MB.');
                return;
              }
              const reader = new FileReader();
              pendingRead.current = reader;
              reader.onload = () => {
                if (pendingRead.current !== reader) return;
                pendingRead.current = null;
                onChange({ private_key: String(reader.result), passphrase: value.passphrase });
                setFilename(file.name);
                setError('');
              };
              reader.onerror = () => {
                if (pendingRead.current !== reader) return;
                pendingRead.current = null;
                setError('The key file could not be read. Choose it again.');
              };
              reader.readAsText(file);
            }}
          />
          <div className="flex min-w-0 items-center gap-3">
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>
              Choose key file
            </Button>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {filename || `Use keys configured on ${hostLabel}`}
            </span>
          </div>
          {value.private_key && (
            <Input
              aria-label="Key passphrase (optional)"
              type="password"
              autoComplete="off"
              placeholder="Key passphrase (optional)"
              value={value.passphrase ?? ''}
              onChange={(event) => onChange({ ...value, passphrase: event.target.value })}
            />
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </Field>
  );
}
