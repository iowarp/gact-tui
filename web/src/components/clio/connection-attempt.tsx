import { ConnectStatusLine } from '@/components/clio/connect-frame';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  NOT_REACHABLE_DETAIL,
  type ConnectionAvailability,
} from '@/hooks/use-connection-availability';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** The line shown while a service starts; it is replaced by the workspace when ready. */
export function ConnectionWaitingNotice({
  availability,
}: {
  availability?: ConnectionAvailability;
}) {
  const detail = availability?.starting ? availability.detail : NOT_REACHABLE_DETAIL;
  return (
    <ConnectStatusLine
      actions={
        <Popover>
          <PopoverTrigger asChild>
            <IconButton icon={<InfoIcon />} label={t`Why it is waiting`} size="sm" type="button" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3 text-meta">
            {detail}
          </PopoverContent>
        </Popover>
      }
      tone="working"
    >
      <Trans>
        <span>Waiting for the service to start</span>
        <span className="text-muted-foreground">. It opens by itself once it answers.</span>
      </Trans>
    </ConnectStatusLine>
  );
}
