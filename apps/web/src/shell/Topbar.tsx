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
 * The console is the one desktop-only surface; the remaining toolbar controls
 * are available in both shells.
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
            <button
              type="button"
              className="shell-topbar__crumb-button"
              onClick={() => onTogglePanel?.('blueprint')}
            >
              <span className="shell-topbar__crumb">{breadcrumb}</span>
            </button>
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
        <ToolbarButton
          label="console"
          icon={<Icon name="console" />}
          pressed={panel === 'console'}
          onClick={() => onTogglePanel?.('console')}
        />
      ) : null}

      <ToolbarButton
        label="artifacts"
        icon={
          <>
            <Icon name="artifacts" />
            <span className="shell-topbar__count">{artifactCount ?? 0}</span>
          </>
        }
        pressed={panel === 'artifacts'}
        onClick={() => onTogglePanel?.('artifacts')}
      />
      <ToolbarButton
        label="ctx"
        icon={
          <>
            <Icon name="ctx" />
            <span className="shell-topbar__count">{contextPercent ?? 0}%</span>
          </>
        }
        pressed={panel === 'context'}
        onClick={() => onTogglePanel?.('context')}
      />
      <ToolbarButton
        label="Observability"
        iconOnly
        icon={<Icon name="eye" size={14} />}
        pressed={panel === 'obs'}
        onClick={() => onTogglePanel?.('obs')}
      />
    </header>
  );
}





