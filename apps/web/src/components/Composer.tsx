import { createSignal } from 'solid-js';
import './composer.css';

export function Composer() {
  const [text, setText] = createSignal('');
  const [permMode, setPermMode] = createSignal<'ask' | 'auto-edits' | 'plan' | 'auto' | 'bypass'>('ask');
  const [model, setModel] = createSignal('opus-4.7');

  return (
    <div class="composer" data-testid="composer">
      <div class="composer__pickers">
        <button type="button" class="composer__picker" data-testid="composer-backend">
          ⬤ jaime@localhost · 7777 ▼
        </button>
        <button type="button" class="composer__picker" data-testid="composer-project">
          📁 gact-tui ▼
        </button>
        <button
          type="button"
          class="composer__picker composer__picker--perm"
          data-testid="composer-perm"
          onClick={() =>
            setPermMode((m) =>
              m === 'ask' ? 'auto-edits' : m === 'auto-edits' ? 'plan' : m === 'plan' ? 'auto' : m === 'auto' ? 'bypass' : 'ask',
            )
          }
        >
          🛡 {permMode()} ▼
        </button>
        <button
          type="button"
          class="composer__picker"
          data-testid="composer-model"
          onClick={() => setModel((m) => (m === 'opus-4.7' ? 'sonnet-4.6' : 'opus-4.7'))}
        >
          {model()} ▼
        </button>
      </div>
      <div class="composer__row">
        <button type="button" class="composer__attach" title="attach context">＋</button>
        <textarea
          class="composer__input"
          placeholder="Ask CLIO about your data…"
          rows={1}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          data-testid="composer-input"
        />
        <button
          type="button"
          class="btn btn--primary composer__send"
          disabled={!text().trim()}
          data-testid="composer-send"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
