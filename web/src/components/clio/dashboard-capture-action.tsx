import { useContext } from 'react';
import { CameraIcon } from 'lucide-react';
import { A2uiRegionCaptureContext } from './a2ui-region-capture';
import type { CaptureTarget } from './a2ui-region-evidence';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';

/**
 * The frame bar's Format control that captures the whole displayed dashboard,
 * with labelled regions, for the conversation: what the dashboard's own
 * toolbar did before the file frame carried its title and exports.
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
  if (!capture) return null;
  return (
    <ViewerToolbarContent>
      <ToolbarAction
        label="Capture labelled regions"
        data-capture-toggle="true"
        aria-pressed={capture.selectingComponentId === 'root'}
        disabledReason={
          capture.allowed ? undefined : 'Choose a model that accepts images to capture a region'
        }
        onClick={() => {
          if (target) capture.start({ element: target, title, componentId: 'root', reference });
        }}
      >
        <CameraIcon aria-hidden="true" />
      </ToolbarAction>
    </ViewerToolbarContent>
  );
}
