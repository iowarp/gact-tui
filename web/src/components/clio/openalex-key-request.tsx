import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { t } from '@lingui/core/macro';

const FALLBACK = t`Check your email and click the activation link. The key works after that.`;

/**
 * Ask OpenAlex for a free key by email. OpenAlex sends an activation link; the key the
 * server keeps starts working once the person opens it.
 */
export function OpenAlexKeyRequest({
  defaultEmail,
  onRequested,
}: {
  defaultEmail: string;
  onRequested: () => void;
}) {
  const repository = useRepository();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const request = useMutation({
    mutationFn: (address: string) => repository.requestOpenAlexKey(address),
    onSuccess: onRequested,
  });
  if (request.data)
    return (
      <p className="mt-1.5 text-xs text-foreground" role="status">
        {request.data.message || FALLBACK}
      </p>
    );
  if (!open)
    return (
      <Button
        className="mt-1 h-6 px-0 text-xs text-primary"
        onClick={() => setOpen(true)}
        size="sm"
        variant="link"
      >
        {t`Get a free OpenAlex key`}
      </Button>
    );
  const valid = /^[^\s@]+@[^\s@]+$/u.test(email.trim());
  return (
    <form
      className="mt-1.5 grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !request.isPending) request.mutate(email.trim());
      }}
    >
      <label className="text-xs text-muted-foreground" htmlFor="openalex-key-email">
        {t`Your email address. OpenAlex sends the key’s activation link there.`}
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          autoComplete="email"
          className="h-7 min-w-0 flex-1 text-xs"
          id="openalex-key-email"
          onChange={(event) => setEmail(event.target.value)}
          // i18n-ignore: an example address, not copy
          placeholder="you@example.org"
          type="email"
          value={email}
        />
        <Button
          className="h-7 px-2.5 text-xs"
          disabled={!valid || request.isPending}
          size="sm"
          type="submit"
          variant="outline"
        >
          {request.isPending ? t`Requesting…` : t`Request key`}
        </Button>
        <Button
          className="h-7 px-2 text-xs"
          onClick={() => setOpen(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t`Cancel`}
        </Button>
      </div>
      {request.error ? (
        <p className="text-xs text-destructive" role="alert">
          {request.error.message}
        </p>
      ) : null}
    </form>
  );
}
