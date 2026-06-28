/**
 * UI component: Preview Rail Browser. Renders `PreviewRailBrowser` from `PreviewRailBrowserProps`.
 */
import { For, Show } from 'solid-js';
import { Icon } from './Icon.js';
import { humanSize, type TreeNode } from './PreviewRailModel.js';
import './preview-rail-browser.css';

export interface PreviewRailBrowserProps {
  workspaceId: string | undefined;
  loading: boolean;
  listError: boolean;
  filter: string;
  rows: Array<{ node: TreeNode; depth: number }>;
  expanded: Set<string>;
  selected: string;
  onFilter: (value: string) => void;
  onRowClick: (node: TreeNode) => void;
}

export function PreviewRailBrowser(props: PreviewRailBrowserProps) {
  return (
    <div class="preview-rail__browser" data-testid="preview-rail-browser">
      <div class="preview-rail__search">
        <Icon name="search" size={13} />
        <input
          type="text"
          class="preview-rail__search-input"
          placeholder="Filter files…"
          value={props.filter}
          data-testid="preview-rail-filter"
          onInput={(e) => props.onFilter(e.currentTarget.value)}
        />
      </div>

      <div class="preview-rail__list" role="tree">
        <Show
          when={props.workspaceId}
          fallback={
            <p class="preview-rail__empty" data-testid="preview-rail-no-workspace">
              Select a session to browse workspace files.
            </p>
          }
        >
          <Show
            when={!props.loading}
            fallback={<p class="preview-rail__empty">Loading files…</p>}
          >
            <Show
              when={!props.listError}
              fallback={
                <p
                  class="preview-rail__empty preview-rail__empty--err"
                  data-testid="preview-rail-list-error"
                >
                  Could not load files.
                </p>
              }
            >
              <Show
                when={props.rows.length > 0}
                fallback={
                  <p class="preview-rail__empty" data-testid="preview-rail-empty">
                    {props.filter ? 'No files match.' : 'Workspace is empty.'}
                  </p>
                }
              >
                <For each={props.rows}>
                  {(row) => (
                    <button
                      type="button"
                      class={
                        'preview-rail__row' +
                        (row.node.type === 'dir'
                          ? ' preview-rail__row--dir'
                          : ' preview-rail__row--file') +
                        (props.selected === row.node.path ? ' is-selected' : '')
                      }
                      style={{ 'padding-left': `${8 + row.depth * 14}px` }}
                      data-testid={`preview-rail-row-${row.node.path}`}
                      data-type={row.node.type}
                      role="treeitem"
                      onClick={() => props.onRowClick(row.node)}
                    >
                      <Show
                        when={row.node.type === 'dir'}
                        fallback={
                          <span class="preview-rail__row-icon">
                            <Icon name="file" size={13} />
                          </span>
                        }
                      >
                        <span
                          class={
                            'preview-rail__row-caret' +
                            (props.expanded.has(row.node.path) || props.filter ? ' is-open' : '')
                          }
                        >
                          <Icon name="chevron-right" size={12} />
                        </span>
                      </Show>
                      <span class="preview-rail__row-name">{row.node.name}</span>
                      <Show when={row.node.type === 'file' && row.node.size != null}>
                        <span class="preview-rail__row-size">{humanSize(row.node.size)}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
