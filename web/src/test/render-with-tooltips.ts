import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Renders under the TooltipProvider the app supplies, which IconButton needs. */
export function renderWithTooltips(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { ...options, wrapper: TooltipProvider });
}
