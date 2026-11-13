import type { MessageCanvas } from '@clio/core/v3';
import { t, ph } from '@lingui/core/macro';

/**
 * The live answer of a snapshot-requested stream. Each `message.canvas` frame
 * replaces the previous text instead of appending to it, and the final answer
 * replaces this preview as an ordinary text block. A `snapshot` frame is one
 * diffusion step's whole answer; an `append` frame is the text accumulated from
 * a route that streamed ordinary deltas, so it is shown without the diffusion
 * label. Frames are rendered as plain text: they can hold partly denoised markup.
 */
export function DiffusionCanvas({ canvas }: { canvas: MessageCanvas }) {
  const diffusing = canvas.shape !== 'append';
  return (
    <div aria-busy="true" className="flex flex-col gap-1" data-testid="diffusion-canvas">
      {diffusing ? (
        <span className="text-xs text-muted-foreground">{t`Diffusing: step ${ph({ step: canvas.step })}`}</span>
      ) : null}
      <p
        aria-live="off"
        className={
          diffusing
            ? 'whitespace-pre-wrap break-words text-foreground/80'
            : 'whitespace-pre-wrap break-words'
        }
      >
        {canvas.text}
      </p>
    </div>
  );
}
