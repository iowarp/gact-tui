import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  NOT_REACHABLE_DETAIL,
  type ConnectionAvailability,
} from '@/hooks/use-connection-availability';

/** The notice shown while a service starts; it is replaced by the workspace when ready. */
export function ConnectionWaitingNotice({
  availability,
}: {
  availability?: ConnectionAvailability;
}) {
  return (
    <Alert role="status">
      <AlertTitle>Waiting for the service to start</AlertTitle>
      <AlertDescription>
        {availability?.starting ? availability.detail : NOT_REACHABLE_DETAIL}
      </AlertDescription>
    </Alert>
  );
}
