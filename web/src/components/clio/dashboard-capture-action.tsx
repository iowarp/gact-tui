import { useContext, useMemo } from 'react';
import { CameraIcon } from 'lucide-react';
import { A2uiRegionCaptureContext } from './a2ui-region-capture';
import type { CaptureTarget } from './a2ui-region-evidence';
import { useFileViewerActions } from './file-viewer-action-context';

/**
 * The frame's … menu row that captures the whole displayed dashboard, with
 * labelled regions, for the conversation: what the dashboard's own toolbar did
 * before the file frame carried its title and exports. The bar itself keeps
 * only Render, Definition and Lineage, as the dashboard frame spec draws it.
 */
export function DashboardCaptureAction({
  target,
  title,
  reference,
}: {
  target: HTMLElement | null;
  title: string;
  reference: CaptureTarget['reference'];
}) {
  const capture = useContext(A2uiRegionCaptureContext);
  const allowed = capture?.allowed ?? false;
  const start = capture?.start;
  const actions = useMemo(
    () =>
      start
        ? [
            {
              label: 'Capture labelled regions',
              description: allowed
                ? 'Send the displayed dashboard, with its regions labelled, to the conversation'
                : 'Choose a model that accepts images to capture a region',
              icon: CameraIcon,
              disabled: !allowed || !target,
              onSelect: () => {
                if (target) start({ element: target, title, componentId: 'root', reference });
              },
            },
          ]
        : [],
    [allowed, start, target, title, reference],
  );
  useFileViewerActions(actions);
  return null;
}
