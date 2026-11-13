import { BookOpenIcon, FileCode2Icon } from 'lucide-react';
import { FileModeControls } from './file-mode-controls';
import { t } from '@lingui/core/macro';

/** A document's modes in the frame's Format: Read (or Paper, or HTML preview) and Source. */
export function DocumentViewControls({
  markdown,
  html = false,
  latex = false,
  paper = false,
  value,
  onChange,
}: {
  markdown: boolean;
  html?: boolean;
  latex?: boolean;
  /** A paper: its sources are in the LaTeX workspace, so it has no separate source view. */
  paper?: boolean;
  value: string;
  onChange: (view: string) => void;
}) {
  const views = [
    {
      value: 'preview',
      label: latex ? t`Paper` : html ? t`HTML preview` : t`Read document`,
      icon: BookOpenIcon,
    },
    ...(markdown || html || (latex && !paper)
      ? [{ value: 'raw', label: t`Source`, icon: FileCode2Icon, shortcut: 'render-source' }]
      : []),
  ];
  return (
    <FileModeControls
      modes={views}
      value={value}
      onChange={onChange}
      label={t`File representations`}
    />
  );
}
