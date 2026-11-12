/**
 * The colours a workspace can carry: the spec's fixed identity palette. Like the
 * data scales they identify something rather than style the interface, so they
 * are the same in every theme.
 */
export const WORKSPACE_COLOURS = [
  { id: 'clay', label: 'Clay', swatch: 'bg-[#c9785b]', text: 'text-[#c9785b]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-[#d9a55b]', text: 'text-[#d9a55b]' },
  { id: 'green', label: 'Green', swatch: 'bg-[#7fb069]', text: 'text-[#7fb069]' },
  { id: 'blue', label: 'Blue', swatch: 'bg-[#5b9fd9]', text: 'text-[#5b9fd9]' },
  { id: 'violet', label: 'Violet', swatch: 'bg-[#a07fd1]', text: 'text-[#a07fd1]' },
] as const;
