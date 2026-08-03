import { ToolbarButton, useIsDesktop } from '../kit';
import './topbar.css';

export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  artifactCount?: number;
  contextPercent?: number;
  railCollapsed: boolean;
  onShowRail: () => void;
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
}: TopbarProps) {
  const isDesktop = useIsDesktop();

  return (
    <header className="shell-topbar" role="banner">
      {railCollapsed ? (
        <ToolbarButton
          label="Show sessions"
          iconOnly
          size="small"
          icon={<PanelIcon />}
          onClick={onShowRail}
        />
      ) : null}

      <h1 className="shell-topbar__title">{title}</h1>
      {breadcrumb ? (
        <>
          <span className="shell-topbar__sep" aria-hidden="true">
            /
          </span>
          <span className="shell-topbar__crumb">{breadcrumb}</span>
        </>
      ) : null}

      <span className="shell-topbar__spacer" />

      <ToolbarButton label="files" icon={<FilesIcon />} onClick={() => {}} />

      {isDesktop ? (
        <ToolbarButton label="Workspace console" icon={<ConsoleIcon />} onClick={() => {}} />
      ) : null}

      <ToolbarButton
        label={`artifacts ${artifactCount ?? 0}`}
        icon={<ArtifactsIcon />}
        onClick={() => {}}
      />
      <ToolbarButton label={`ctx ${contextPercent ?? 0}%`} icon={<CtxIcon />} onClick={() => {}} />
      <ToolbarButton label="Observability" iconOnly icon={<EyeIcon />} onClick={() => {}} />
    </header>
  );
}

function PanelIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 1.5v9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 1.5h4l3 3v6h-7z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ConsoleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="2" width="9" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3.6 5.1l1.3 1.3-1.3 1.3M6.4 7.7h2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArtifactsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 4.5h9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CtxIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M1.5 10.5V7M6 10.5V4M10.5 10.5V1.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1.2 7S3.3 3.2 7 3.2 12.8 7 12.8 7 10.7 10.8 7 10.8 1.2 7 1.2 7z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
