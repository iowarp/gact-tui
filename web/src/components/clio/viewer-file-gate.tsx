import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScanEyeIcon } from 'lucide-react';
import { useNearViewport } from '@/hooks/use-near-viewport';
import { cn } from '@/lib/utils';
import { StateView, type StateAction } from './primitives/state-view';
import { VIEWER_ARTIFACT_URI } from './viewer-file-schema';

export interface ViewerFileGateProps {
  /** What the viewer shows, for the placeholder and messages (for example "3D view"). */
  noun: string;
  /** The viewer's resolved file properties; an unset optional one is `undefined`. */
  files: readonly (string | undefined)[];
  /** Tailwind height of the placeholder, matching the viewer's own frame. */
  heightClass?: string;
  /** The producer's own height for the viewer, in CSS pixels; it wins over `heightClass`. */
  height?: number;
  children?: ReactNode;
}

/**
 * Mounts a heavy viewer only near the viewport and disposes it when it leaves (#1823),
 * so a dashboard of many viewers holds a scene or graphics context only for those in
 * view. A file a binding resolved to something other than a registered artifact is
 * said in words and nothing loads; a lost WebGL context is said in words with a way
 * to reload the view.
 */
export function ViewerFileGate({
  noun,
  files,
  heightClass = 'h-80',
  height,
  children,
}: ViewerFileGateProps) {
  const frame = useRef<HTMLDivElement>(null);
  // One viewport height ahead, so a view is ready by the time it scrolls in.
  const near = useNearViewport(frame, '100%');
  const [lost, setLost] = useState(false);
  const [mount, setMount] = useState(0);
  const reload = useCallback(() => {
    setLost(false);
    setMount((value) => value + 1);
  }, []);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // The event does not bubble; a capturing listener on the frame still hears it.
    const onLost = () => setLost(true);
    element.addEventListener('webglcontextlost', onLost, true);
    return () => element.removeEventListener('webglcontextlost', onLost, true);
  }, []);
  const invalid = files.find(
    (file) => file !== undefined && file !== '' && !VIEWER_ARTIFACT_URI.test(file),
  );
  const missing = files[0] === undefined || files[0] === '';
  const size = { heightClass: height ? '' : heightClass, height };
  let body: ReactNode;
  if (invalid !== undefined)
    body = (
      <Message
        {...size}
        kind="error"
        title={`This view's file is not a registered artifact: ${invalid}`}
      />
    );
  else if (missing)
    body = <Message {...size} kind="empty" title={`Nothing is selected for this ${noun} yet.`} />;
  else if (lost)
    body = (
      <Message
        {...size}
        action={{ label: 'Reload view', onClick: reload }}
        kind="error"
        title={`This ${noun} lost its graphics context; the browser keeps only a few open at once.`}
      />
    );
  else if (!near)
    body = (
      <Message
        {...size}
        kind="unavailable"
        title={`The ${noun} loads when it scrolls into view.`}
      />
    );
  else body = <div key={mount}>{children}</div>;
  return (
    <div className="min-w-0" data-slot="viewer-file-gate" ref={frame}>
      {body}
    </div>
  );
}

/** A gated viewer's state, in the shared viewer-state look inside the viewer's own box. */
function Message({
  heightClass,
  height,
  kind,
  title,
  action,
}: {
  heightClass: string;
  height?: number;
  kind: 'error' | 'empty' | 'unavailable';
  title: string;
  action?: StateAction;
}) {
  return (
    <div className={cn(heightClass, 'rounded-lg border')} style={height ? { height } : undefined}>
      <StateView
        action={action}
        icon={kind === 'unavailable' ? ScanEyeIcon : undefined}
        kind={kind}
        size="viewer"
        title={title}
      />
    </div>
  );
}
