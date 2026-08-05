import { brand } from '@brand';
import { Icon, InlineEdit, ToolbarButton, useIsDesktop } from '../kit';
import './topbar.css';

export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  /** Tooltip on the breadcrumb button — the prototype distinguishes "pick
      one" from "view/edit the one you have" here. */
  breadcrumbTitle?: string;
  artifactCount?: number;
  contextPercent?: number;
  railCollapsed: boolean;
  onShowRail: () => void;
  /** Which side panel is open, so the toolbar can report pressed state. */
  panel?: string | null;
  /** Observability tab the layer is showing — 'artifacts'/'ctx' deep-link
   *  into it rather than opening a panel of their own (proto tgArtifacts /
   *  tgTelemetry both target the SAME layer, just a different tab). */
  obsTab?: string;
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
  breadcrumbTitle,
  artifactCount,
  contextPercent,
  railCollapsed,
  onShowRail,
  panel,
  obsTab,
  onTogglePanel,
  onRename,
}: TopbarProps) {
  const isDesktop = useIsDesktop();

  return (
    <header className="shell-topbar" role="banner">
      {railCollapsed ? (
        <>
          {/* The rail's own lockup (logo + wordmark) is gone once collapsed —
              the prototype keeps a small mark here so brand identity survives
              collapse instead of vanishing entirely (measured: a 22x22
              image immediately before the expand control, `tgLeft`). */}
          {brand.logoImage ? (
            <img className="shell-topbar__mini-logo" src={brand.logoImage} alt="" />
          ) : (
            <span className="shell-topbar__mini-mark" aria-hidden="true">
              {brand.markGlyph}
            </span>
          )}
          <ToolbarButton
            label="Show sessions"
            iconOnly
            size="small"
            icon={<Icon name="panel" />}
            onClick={onShowRail}
          />
        </>
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
              {...(breadcrumbTitle ? { title: breadcrumbTitle } : {})}
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
        pressed={panel === 'obs' && obsTab === 'artifacts'}
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
        pressed={panel === 'obs' && obsTab === 'context'}
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





