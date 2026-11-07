import type { MessageCanvas } from '@clio/core/v3';

/**
 * The live whole-answer snapshot of a diffusion model. Each `message.canvas`
 * frame replaces the previous text instead of appending to it, and the final
 * answer replaces this preview as an ordinary text block. Intermediate frames
 * are rendered as plain text: they can hold partly denoised markup.
 */
export function DiffusionCanvas({ canvas }: { canvas: MessageCanvas }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-1" data-testid="diffusion-canvas">
      <span className="text-xs text-muted-foreground">Diffusing · step {canvas.step}</span>
      <p aria-live="off" className="whitespace-pre-wrap break-words text-foreground/80">
        {canvas.text}
      </p>
    </div>
  );
}
