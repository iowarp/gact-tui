import { useEffect, useMemo, useState } from 'react';
import type { Client, Session, Workspace } from '@clio/core';
import { Eyebrow, Icon, Modal, Tabs } from '../kit';
import './owner-surfaces.css';

export interface SearchDialogProps {
  open: boolean;
  sessions: Session[];
  workspaces: Workspace[];
  onChooseSession: (sessionId: string) => void;
  onClose: () => void;
}

/** Prototype search: one live query across workspace headers and sessions. */
export function SearchDialog({
  open,
  sessions,
  workspaces,
  onChooseSession,
  onClose,
}: SearchDialogProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const workspaceRows = workspaces.filter((workspace) => {
      const label = workspace.root_path || workspace.name || workspace.id;
      return normalized.length > 0 && label.toLowerCase().includes(normalized);
    });
    const sessionRows = sessions.filter((session) => {
      const label = session.title || session.id;
      return normalized.length === 0 || label.toLowerCase().includes(normalized);
    });
    return { workspaceRows, sessionRows };
  }, [query, sessions, workspaces]);

  const firstResult = rows.workspaceRows[0]
    ? { kind: 'workspace' as const }
    : rows.sessionRows[0]
      ? { kind: 'session' as const, id: rows.sessionRows[0].id }
      : null;

  function chooseFirst(): void {
    if (!firstResult) return;
    if (firstResult.kind === 'session') onChooseSession(firstResult.id);
    onClose();
  }

  return (
    <Modal open={open} title="search" onClose={onClose}>
      <div className="session-search">
        <label className="session-search__box">
          <Icon name="search" size={14} />
          <input
            type="search"
            aria-label="Search sessions and workspaces"
            placeholder="Search sessions and workspaces"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (!firstResult) return;
              event.preventDefault();
              chooseFirst();
            }}
          />
        </label>
        <div className="session-search__results" aria-live="polite">
          {rows.workspaceRows.map((workspace, index) => (
            <button
              type="button"
              className="session-search__row"
              data-kind="workspace"
              key={workspace.id}
              onClick={onClose}
            >
              <Icon name="folder" />
              <span>{workspace.root_path || workspace.name || workspace.id}</span>
              <span className="session-search__hint">{index === 0 ? 'Enter' : ''}</span>
            </button>
          ))}
          {rows.sessionRows.map((session, index) => (
            <button
              type="button"
              className="session-search__row"
              key={session.id}
              aria-label={session.title || session.id}
              onClick={() => {
                onChooseSession(session.id);
                onClose();
              }}
            >
              <Icon name="ask" />
              <span>{session.title || session.id}</span>
              <span className="session-search__hint">
                {rows.workspaceRows.length === 0 && index === 0
                  ? 'Enter'
                  : formatSearchTime(session.updated_at)}
              </span>
            </button>
          ))}
          {rows.workspaceRows.length === 0 && rows.sessionRows.length === 0 ? (
            <p className="session-search__empty">No matching sessions or workspaces.</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export interface RemoveWorkspaceConfirmProps {
  /** `null` = nothing pending, closed. Non-null carries what the modal names. */
  workspace: { id: string; name: string; sessionCount: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The prototype's `wsConfirmOpen` gate (design/prototype/Clio Session.html,
 * ~offset 8104304): selecting "remove workspace" from the rail's group menu
 * does NOT delete immediately — it opens this confirmation first. A single
 * misclick on a context-menu row must not permanently unregister a workspace
 * with no way back.
 */
export function RemoveWorkspaceConfirm({
  workspace,
  onCancel,
  onConfirm,
}: RemoveWorkspaceConfirmProps) {
  return (
    <Modal
      open={workspace !== null}
      title="remove workspace"
      tone="danger"
      header={
        <h2 className="remove-workspace-confirm__title">
          <Icon name="warning" size={15} />
          remove workspace
        </h2>
      }
      footer={
        <div className="remove-workspace-confirm__footer">
          <button
            type="button"
            className="remove-workspace-confirm__cancel"
            onClick={onCancel}
          >
            cancel
          </button>
          <button
            type="button"
            className="remove-workspace-confirm__confirm"
            onClick={onConfirm}
          >
            remove workspace
          </button>
        </div>
      }
      onClose={onCancel}
    >
      {workspace ? (
        <p className="remove-workspace-confirm__body">
          {`Remove "${workspace.name}" and its ${workspace.sessionCount} session(s) from the sidebar?`}
          <br />
          <span className="remove-workspace-confirm__hint">
            files on disk are not touched — this only removes it from clio.
          </span>
        </p>
      ) : null}
    </Modal>
  );
}

function formatSearchTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

interface CatalogueItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
}

export interface NewDialogProps {
  client: Client;
  open: boolean;
  workspaces: Workspace[];
  initialWorkspaceId?: string;
  onCreateSession: (input: {
    title: string;
    workspaceId?: string;
    blueprintId?: string;
    expertPackId?: string;
  }) => Promise<void>;
  onCreateWorkspace: (input: { name: string; rootPath: string }) => Promise<void>;
  onClose: () => void;
}

/** The prototype +new dialog, backed by the three live catalogue routes. */
export function NewDialog({
  client,
  open,
  workspaces,
  initialWorkspaceId,
  onCreateSession,
  onCreateWorkspace,
  onClose,
}: NewDialogProps) {
  const [tab, setTab] = useState('session');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [blueprintId, setBlueprintId] = useState('');
  const [expertPackId, setExpertPackId] = useState('');
  const [blueprints, setBlueprints] = useState<CatalogueItem[]>([]);
  const [expertPacks, setExpertPacks] = useState<CatalogueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('session');
    setName('');
    setWorkspaceName('');
    setRootPath('');
    setWorkspaceId(initialWorkspaceId ?? workspaces[0]?.id ?? '');
    setBlueprintId('');
    setExpertPackId('');
    setError(null);
    void Promise.allSettled([client.agentBlueprints(), client.expertPacks()]).then(
      ([blueprintsResult, packsResult]) => {
        if (blueprintsResult.status === 'fulfilled') {
          setBlueprints(blueprintsResult.value.blueprints as CatalogueItem[]);
        }
        if (packsResult.status === 'fulfilled') {
          setExpertPacks(packsResult.value.packs as CatalogueItem[]);
        }
      },
    );
  }, [client, initialWorkspaceId, open, workspaces]);

  async function create(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      if (tab === 'workspace') {
        await onCreateWorkspace({ name: workspaceName.trim(), rootPath: rootPath.trim() });
      } else {
        await onCreateSession({
          title: name.trim() || 'untitled session',
          ...(workspaceId ? { workspaceId } : {}),
          ...(blueprintId ? { blueprintId } : {}),
          ...(expertPackId ? { expertPackId } : {}),
        });
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  }

  const footer = (
    <div className="new-dialog__footer">
      {error ? <span className="new-dialog__error" role="alert">{error}</span> : <span />}
      <button
        type="button"
        className="new-dialog__create"
        disabled={creating || (tab === 'workspace' && !rootPath.trim())}
        onClick={() => void create()}
      >
        {tab === 'workspace' ? 'CREATE WORKSPACE' : 'CREATE SESSION'}
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      title="new"
      header={<h2 className="new-dialog__title"><Icon name="plus" size={13} /> new</h2>}
      footer={footer}
      onClose={onClose}
    >
      <div className="new-dialog">
        <Tabs
          label="Create kind"
          tabs={[{ id: 'session', label: 'session' }, { id: 'workspace', label: 'workspace' }]}
          activeId={tab}
          onChange={setTab}
        />
        {tab === 'session' ? (
          <div className="new-dialog__fields">
            <input
              aria-label="Session name"
              placeholder="untitled session"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <label><Eyebrow strong>agent blueprint</Eyebrow><select aria-label="Agent blueprint" value={blueprintId} onChange={(event) => setBlueprintId(event.currentTarget.value)}><option value="">none</option>{blueprints.map((item) => <option value={item.id} key={item.id}>{item.title || item.name || item.id}</option>)}</select></label>
            <label><Eyebrow strong>expert pack</Eyebrow><select aria-label="Expert pack" value={expertPackId} onChange={(event) => setExpertPackId(event.currentTarget.value)}><option value="">none</option>{expertPacks.map((item) => <option value={item.id} key={item.id}>{item.title || item.name || item.id}</option>)}</select></label>
            <label><Eyebrow strong>workspace</Eyebrow><select aria-label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.currentTarget.value)}><option value="">ungrouped</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.root_path || workspace.name || workspace.id}</option>)}</select></label>
          </div>
        ) : (
          <div className="new-dialog__fields">
            <label><Eyebrow strong>name</Eyebrow><input aria-label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.currentTarget.value)} placeholder="e.g. ior-sweeps" /></label>
            <label>
              <Eyebrow strong>path</Eyebrow>
              <span className="new-dialog__pathrow">
                <input aria-label="Root path" value={rootPath} onChange={(event) => setRootPath(event.currentTarget.value)} placeholder="/scratch/…" />
                {/* clio-agent serves no OS file picker (browser AND desktop
                    builds alike) — shown and flagged rather than hidden, same
                    convention as the composer's attach button. */}
                <button
                  type="button"
                  className="new-dialog__browse"
                  title="Browse — opens the OS file picker (not wired yet; type the path)"
                  data-unbacked="true"
                  disabled
                >
                  <Icon name="folder" size={12} />
                  browse…
                </button>
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
