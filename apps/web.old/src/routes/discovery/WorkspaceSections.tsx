/**
 * Discovery surface: Workspace Sections component. Key export `WorkspaceCreateFormProps`.
 */
import { Icon } from '../../components/Icon.js';

export interface WorkspaceCreateFormProps {
  rootPath: string;
  name: string;
  submitting: boolean;
  onRootPath: (value: string) => void;
  onName: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: Event) => void;
}

export function WorkspaceCreateForm(props: WorkspaceCreateFormProps) {
  return (
    <form class="ws-form" onSubmit={props.onSubmit} data-testid="workspaces-form">
      <label class="ws-form__row">
        <span class="ws-form__label">Root path</span>
        <input
          class="ws-form__input"
          type="text"
          value={props.rootPath}
          onInput={(e) => props.onRootPath(e.currentTarget.value)}
          placeholder="/Users/jane/projects/llm-eval"
          autofocus
          data-testid="workspaces-root-input"
        />
      </label>
      <label class="ws-form__row">
        <span class="ws-form__label">Display name (optional)</span>
        <input
          class="ws-form__input"
          type="text"
          value={props.name}
          onInput={(e) => props.onName(e.currentTarget.value)}
          placeholder="llm-eval"
          data-testid="workspaces-name-input"
        />
      </label>
      <div class="ws-form__actions">
        <button
          type="button"
          class="ws-form__btn"
          onClick={props.onCancel}
          disabled={props.submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="ws-form__btn ws-form__btn--primary"
          disabled={props.submitting || !props.rootPath.trim()}
          data-testid="workspaces-submit"
        >
          {props.submitting ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </form>
  );
}

export interface WorkspaceSearchRowProps {
  query: string;
  onQuery: (value: string) => void;
}

export function WorkspaceSearchRow(props: WorkspaceSearchRowProps) {
  return (
    <div class="dp__search-row">
      <Icon name="search" size={14} class="dp__search-icon" />
      <input
        type="text"
        class="dp__search-input"
        placeholder="Filter workspaces by name, id, or root path…"
        value={props.query}
        onInput={(e) => props.onQuery(e.currentTarget.value)}
        data-testid="workspaces-search"
      />
    </div>
  );
}

export interface WorkspaceAddCardProps {
  brandName: string;
  onClick: () => void;
}

export function WorkspaceAddCard(props: WorkspaceAddCardProps) {
  return (
    <button
      type="button"
      class="dp__card dp__card--add"
      onClick={props.onClick}
      data-testid="workspaces-add-card"
    >
      <span class="dp__card-add-icon">
        <Icon name="plus" size={20} />
      </span>
      <span class="dp__card-add-label">Add a workspace</span>
      <span class="dp__card-add-sub">
        Point {props.brandName} at a project folder on the backend host.
      </span>
    </button>
  );
}
