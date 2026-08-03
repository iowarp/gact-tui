import { Icon, InlineEdit, ToolbarButton, useIsDesktop } from '../kit';
import './topbar.css';

export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  artifactCount?: number;
  contextPercent?: number;
  railCollapsed: boolean;
  onShowRail: () => void;
  /** Which side panel is open, so the toolbar can report pressed state. */
  panel?: string | null;
  onTogglePanel?: (panel: string) => void;
  /** Supplying this makes the title rename-in-place, as the prototype does. */
  onRename?: (next: string) => void;
}

/**
 * The topbar — session identity plus the surface toolbar.
 *
 * Capability rule, taken from the prototype: ONLY the workspace console is
 * desktop-gated. `files`, `artifacts`, `ctx` and observability render in the
 * browser too, so this must not become a shell-wide desktop gate.
 */
export function Topbar({
  title,
  breadcrumb,
  artifactCount,
  contextPercent,
  railCollapsed,
  onShowRail,
  panel,
  onTogglePanel,
  onRename,
}: TopbarProps) {
  const isDesktop = useIsDesktop();

  return (
    <header className="shell-topbar" role="banner">
      {railCollapsed ? (
        <ToolbarButton
          label="Show sessions"
          iconOnly
          size="small"
          icon={<Icon name="panel" />}
          onClick={onShowRail}
        />
      ) : null}

      <div className="shell-topbar__identity">
        {onRename ? (
          <h1 className="shell-topbar__title">
            <InlineEdit value={title} label="Session title" size="title" onCommit={onRename} />
          </h1>
        ) : (
          <h1 className="shell-topbar__title">{title}</h1>
        )}
        {breadcrumb ? (
          <>
            <span className="shell-topbar__sep" aria-hidden="true">
              /
            </span>
            <span className="shell-topbar__crumb">{breadcrumb}</span>
          </>
        ) : null}
      </div>

      <span className="shell-topbar__spacer" />

      <ToolbarButton
        label="files"
        icon={<Icon name="folder" />}
        pressed={panel === 'files'}
        onClick={() => onTogglePanel?.('files')}
      />

      {isDesktop ? (
        <ToolbarButton label="Workspace console" icon={<Icon name="console" />} onClick={() => {}} />
      ) : null}

      <ToolbarButton
        label={`artifacts ${artifactCount ?? 0}`}
        icon={<Icon name="artifacts" />}
        pressed={panel === 'artifacts'}
        onClick={() => onTogglePanel?.('artifacts')}
      />
      <ToolbarButton
        label={`ctx ${contextPercent ?? 0}%`}
        icon={<Icon name="ctx" />}
        pressed={panel === 'context'}
        onClick={() => onTogglePanel?.('context')}
      />
      <ToolbarButton
        label="Observability"
        iconOnly
        icon={<Icon name="eye" />}
        pressed={panel === 'obs'}
        onClick={() => onTogglePanel?.('obs')}
      />
    </header>
  );
}





