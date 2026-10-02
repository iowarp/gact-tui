import { useEffect } from 'react';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

/** Keep the structured capture as a compact composer annotation beside its PNG. */
export function useRegionCaptureAnnotation(
  annotations: readonly ComposerAnnotation[],
  onAnnotationsChange?: (annotations: readonly ComposerAnnotation[]) => void,
): void {
  useEffect(() => {
    const addCapture = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; title?: string; summary?: string; filename?: string }>).detail;
      if (typeof detail?.text !== 'string' || typeof detail.filename !== 'string' || !onAnnotationsChange) return;
      onAnnotationsChange([
        ...annotations,
        {
          id: `region-capture-${Date.now()}-${annotations.length}`,
          kind: 'region-capture',
          filename: detail.filename,
          title: detail.title || 'Region capture',
          summary: detail.summary || 'Labelled surface regions',
          markdown: detail.text,
        },
      ]);
    };
    window.addEventListener('clio:add-region-capture', addCapture);
    return () => window.removeEventListener('clio:add-region-capture', addCapture);
  }, [annotations, onAnnotationsChange]);
}
