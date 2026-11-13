/**
 * The colours a workspace can carry: the spec's fixed identity palette. Like the
 * data scales they identify something rather than style the interface. Dark
 * themes draw the spec's hex; light themes a deeper tint of the same hue that
 * keeps the mark at 3:1 or more on every light surface it sits on (the bar, a
 * selected row, cards and menus).
 */
export const WORKSPACE_COLOURS = [
  {
    id: 'clay',
    label: 'Clay',
    swatch: 'bg-[#c36a4a] dark:bg-[#c9785b]',
    text: 'text-[#c36a4a] dark:text-[#c9785b]',
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: 'bg-[#ad7628] dark:bg-[#d9a55b]',
    text: 'text-[#ad7628] dark:text-[#d9a55b]',
  },
  {
    id: 'green',
    label: 'Green',
    swatch: 'bg-[#608e4b] dark:bg-[#7fb069]',
    text: 'text-[#608e4b] dark:text-[#7fb069]',
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: 'bg-[#3086cf] dark:bg-[#5b9fd9]',
    text: 'text-[#3086cf] dark:text-[#5b9fd9]',
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: 'bg-[#9570cc] dark:bg-[#a07fd1]',
    text: 'text-[#9570cc] dark:text-[#a07fd1]',
  },
] as const;
