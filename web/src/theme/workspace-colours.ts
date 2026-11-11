/**
 * The colours a workspace can carry: the spec's fixed identity palette. Like the
 * data scales they identify something rather than style the interface, so they
 * are the same in every theme.
 */
export const WORKSPACE_COLOURS = [
  { id: 'clay', label: 'Clay', swatch: 'bg-[#c9785b]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-[#d9a55b]' },
  { id: 'green', label: 'Green', swatch: 'bg-[#7fb069]' },
  { id: 'blue', label: 'Blue', swatch: 'bg-[#5b9fd9]' },
  { id: 'violet', label: 'Violet', swatch: 'bg-[#a07fd1]' },
] as const;
