import { brand } from '@brand';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import type { ConflictAnswer, FoundConflict } from './managed-service-target-utils';
import { t, ph } from '@lingui/core/macro';

const { agent } = vocab;

/** Explain the existing agent and the consequences of each choice before any change. */
export function RemoteAgentConflict({
  found,
  label,
  onChoice,
}: {
  found: FoundConflict;
  label: string;
  onChoice: (choice: ConflictAnswer) => void;
}) {
  const buttonClass = 'h-auto min-h-8 max-w-full whitespace-normal text-left';
  const stopped = found.health === 'stopped';
  const { installedVersion: version, pid } = found;
  const outdated = Boolean(
    found.owner && found.targetVersion && found.targetVersion !== found.installedVersion,
  );
  return (
    <div
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-4"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm">
        {found.health === 'healthy'
          ? pid
            ? t`${agent} ${version} is already running on ${label} (pid ${pid}).`
            : t`${agent} ${version} is already running on ${label}.`
          : stopped
            ? t`${agent} ${version} is installed on ${label} but not running.`
            : pid
              ? t`${agent} on ${label} isn't answering (pid ${pid}) — Replace it?`
              : t`${agent} on ${label} isn't answering — Replace it?`}
      </p>
      <p className="text-sm text-muted-foreground">
        {found.targetVersion
          ? t`Existing agent: ${version}. This app: ${ph({ target: found.targetVersion })}.`
          : t`Existing agent: ${version}. This app: not reported.`}{' '}
        {stopped
          ? t`Starting it keeps its version and data.`
          : t`Reconnecting keeps the existing process and its lifecycle unchanged.`}
      </p>
      {found.owner ? (
        <p className="break-all text-xs text-muted-foreground">
          {t`Installation: ${ph({ owner: found.owner })}. Port: ${ph({ port: found.port ?? brand.agentPort })}.`}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {stopped
          ? t`Update installs this app’s version in the same place, then starts it. Starting a new one leaves this installation alone and uses the next port with a separate installation.`
          : t`Update restarts the existing installation at the target version. Replace stops the existing process and installs at the selected location. Starting another leaves it running and uses the next port with a separate installation.`}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {found.health === 'healthy' || stopped ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('connect')}
            type="button"
            variant={stopped && !outdated ? 'default' : 'outline'}
          >
            {stopped
              ? t`Start it and connect (${version})`
              : t`Reconnect to the running ${agent} (${version})`}
          </Button>
        ) : null}
        {outdated ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('update')}
            type="button"
            variant={stopped ? 'default' : 'outline'}
          >
            {stopped ? t`Update and connect` : t`Reconnect and update`}
          </Button>
        ) : null}
        {stopped ? null : (
          <Button className={buttonClass} onClick={() => onChoice('replace')} type="button">
            {t`Stop and replace`}
          </Button>
        )}
        {found.owner ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('new')}
            type="button"
            variant="outline"
          >
            {stopped ? t`Start a new one` : t`Leave it running and start another`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
