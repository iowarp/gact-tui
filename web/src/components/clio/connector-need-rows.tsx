import type { Connector, ConnectorNeed } from '@clio/core/v3';
import { KeyRoundIcon, LogInIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConnectorLogo } from '@/hooks/use-connectors';
import { perConversation, type ConnectorDraft } from '@/lib/connector-draft';
import { cn } from '@/lib/utils';
import { Monogram } from './primitives/monogram';
import { ph, t } from '@lingui/core/macro';

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
 *
 * In a conversation (`saveAsDefault` given) an address or value is this conversation's;
 * each such row has "Save as default", which also makes it the default for new ones.
 */
export function ConnectorNeedRows({
  needs,
  draft,
  onDraft,
  onSignIn,
  disabled = false,
  submitLabel,
  onSubmit,
  saveAsDefault,
  onSaveAsDefault,
}: {
  needs: readonly ConnectorNeed[];
  draft: ConnectorDraft;
  onDraft: (key: string, value: string) => void;
  onSignIn: (need: ConnectorNeed) => void;
  disabled?: boolean;
  /** Enter in a field submits, with this as the form's accessible action. */
  submitLabel?: string;
  onSubmit?: () => void;
  /** In a conversation: the rows also saved as the person's defaults. */
  saveAsDefault?: Readonly<Record<string, boolean>>;
  onSaveAsDefault?: (key: string, save: boolean) => void;
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
        // A catalog's help may end without a full stop (a URL); the next sentence needs one.
        const help = need.help?.trim().replace(/([^.!?…])$/u, '$1.');
        const hint = [help, need.agent_settable ? t`The agent can set this.` : '']
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
                {need.required ? t`Required` : t`Optional`}
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
                  {need.has_value ? t`Sign in again` : t`Sign in`}
                </Button>
                <span className="text-xs text-muted-foreground" role="status">
                  {need.has_value ? t`Signed in` : t`Not signed in`}
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
                  placeholder={need.has_value ? t`Saved. Type a new one to replace it` : ''}
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
            {saveAsDefault && onSaveAsDefault && perConversation(need) ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Checkbox
                  aria-describedby={`${id}-default-hint`}
                  checked={Boolean(saveAsDefault[need.key])}
                  disabled={disabled}
                  id={`${id}-default`}
                  onCheckedChange={(checked) => onSaveAsDefault(need.key, checked === true)}
                />
                <label className="text-xs" htmlFor={`${id}-default`}>
                  {t`Save as default`}
                </label>
                <span className="text-xs text-muted-foreground" id={`${id}-default-hint`}>
                  {saveAsDefault[need.key]
                    ? t`New conversations use it too.`
                    : need.conversation && need.default_value !== need.value
                      ? need.default_value
                        ? t`This conversation only. Default: ${ph({ value: need.default_value })}`
                        : t`This conversation only. Default: none`
                      : t`This conversation only.`}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
      {/* Enter in a field submits; the visible buttons belong to the card. */}
      <button className="hidden" disabled={disabled || !onSubmit} type="submit" />
    </form>
  );
}
