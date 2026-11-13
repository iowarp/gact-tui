import type { Connector, ConnectorNeed } from '@clio/core/v3';
import { KeyRoundIcon, LogInIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConnectorLogo } from '@/hooks/use-connectors';
import type { ConnectorDraft } from '@/lib/connector-draft';
import { cn } from '@/lib/utils';
import { Monogram } from './primitives/monogram';

/** A connector's logo, or its monogram when it has none (CN11). */
export function ConnectorLogo({
  connector,
  className,
}: {
  connector: Pick<Connector, 'id' | 'name' | 'logo_url'>;
  className?: string;
}) {
  const logo = useConnectorLogo(connector);
  if (logo.data)
    return (
      <img
        alt=""
        className={cn('size-[26px] shrink-0 object-contain', className)}
        data-slot="connector-logo"
        src={logo.data}
      />
    );
  return <Monogram className={className} name={connector.name} />;
}

/**
 * One row for each need (CN4): a text field for an address or a value, a masked field
 * for a secret that is never shown again once saved, and a sign-in button that uses
 * the connection's existing sign-in.
 */
export function ConnectorNeedRows({
  needs,
  draft,
  onDraft,
  onSignIn,
  disabled = false,
  submitLabel,
  onSubmit,
}: {
  needs: readonly ConnectorNeed[];
  draft: ConnectorDraft;
  onDraft: (key: string, value: string) => void;
  onSignIn: (need: ConnectorNeed) => void;
  disabled?: boolean;
  /** Enter in a field submits, with this as the form's accessible action. */
  submitLabel?: string;
  onSubmit?: () => void;
}) {
  const ids = useId();
  return (
    <form
      aria-label={submitLabel}
      className="grid min-w-0 gap-3"
      data-slot="connector-need-rows"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {needs.map((need) => {
        const id = `${ids}-${need.key}`;
        const hint = [need.help, need.agent_settable ? 'The agent can set this.' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div
            className="grid min-w-0 gap-1"
            data-need={need.key}
            data-need-kind={need.kind}
            key={need.key}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              {/* A sign-in row's button says what it does; its label names the row. */}
              <label
                className="min-w-0 text-[0.8125rem] font-medium"
                htmlFor={need.kind === 'sign-in' ? undefined : id}
                id={`${id}-label`}
              >
                {need.label || need.key}
              </label>
              <span className="text-xs text-muted-foreground">
                {need.required ? 'Required' : 'Optional'}
              </span>
            </div>
            {hint ? (
              <p className="text-xs leading-4 text-muted-foreground" id={`${id}-hint`}>
                {hint}
              </p>
            ) : null}
            {need.kind === 'sign-in' ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  aria-describedby={[`${id}-label`, hint ? `${id}-hint` : ''].join(' ').trim()}
                  className="h-7 px-2.5 text-xs"
                  disabled={disabled}
                  id={id}
                  onClick={() => onSignIn(need)}
                  size="sm"
                  type="button"
                  variant={need.has_value ? 'outline' : 'default'}
                >
                  <LogInIcon aria-hidden="true" />
                  {need.has_value ? 'Sign in again' : 'Sign in'}
                </Button>
                <span className="text-xs text-muted-foreground" role="status">
                  {need.has_value ? 'Signed in' : 'Not signed in'}
                </span>
              </div>
            ) : need.kind === 'secret' ? (
              <div className="flex min-w-0 items-center gap-2">
                <KeyRoundIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <Input
                  aria-describedby={hint ? `${id}-hint` : undefined}
                  autoComplete="new-password"
                  className="h-[1.875rem] min-w-0 text-[0.78125rem]"
                  disabled={disabled}
                  id={id}
                  onChange={(event) => onDraft(need.key, event.target.value)}
                  placeholder={need.has_value ? 'Saved. Type a new one to replace it' : ''}
                  spellCheck={false}
                  type="password"
                  value={draft[need.key] ?? ''}
                />
              </div>
            ) : need.options.length ? (
              <Select
                disabled={disabled}
                onValueChange={(value) => onDraft(need.key, value)}
                value={draft[need.key] ?? need.value ?? ''}
              >
                <SelectTrigger
                  aria-describedby={hint ? `${id}-hint` : undefined}
                  className="h-[1.875rem] min-w-0 text-[0.78125rem]"
                  id={id}
                >
                  <SelectValue placeholder={need.default ?? 'Choose'} />
                </SelectTrigger>
                <SelectContent>
                  {need.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                aria-describedby={hint ? `${id}-hint` : undefined}
                autoComplete="off"
                className="h-[1.875rem] min-w-0 text-[0.78125rem]"
                disabled={disabled}
                id={id}
                onChange={(event) => onDraft(need.key, event.target.value)}
                placeholder={need.default ?? ''}
                spellCheck={false}
                value={draft[need.key] ?? need.value ?? ''}
              />
            )}
          </div>
        );
      })}
      {/* Enter in a field submits; the visible buttons belong to the card. */}
      <button className="hidden" disabled={disabled || !onSubmit} type="submit" />
    </form>
  );
}
