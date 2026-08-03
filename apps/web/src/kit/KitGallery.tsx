import { useState } from 'react';
import {
  MasterDetail,
  Chip,
  ContextMenu,
  Eyebrow,
  KvGrid,
  Modal,
  PartCard,
  Popover,
  Select,
  Splitter,
  Tabs,
  ToolbarButton,
  useIsDesktop,
} from './index';
import './gallery.css';

/**
 * Kit fixtures harness (gact-tui#331 acceptance).
 *
 * Renders every primitive in its variants on one page so the kit can be
 * eyeballed against the prototype and screenshot-diffed by the visual harness
 * (#340). Reached at `?kit` — it is a development surface, not app chrome.
 */
export function KitGallery() {
  const [openModal, setOpenModal] = useState<null | 'default' | 'danger' | 'scroll'>(null);
  const [tab, setTab] = useState('log');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(260);
  const [model, setModel] = useState('sonnet');
  const [page, setPage] = useState('providers');
  const isDesktop = useIsDesktop();

  return (
    <main className="kit-gallery" data-testid="kit-gallery">
      <h1 className="kit-gallery__title">Component kit</h1>
      <p className="kit-gallery__note">
        Geometry transcribed from the Session v3 prototype. Desktop capability:{' '}
        <strong data-testid="kit-gallery-desktop">{isDesktop ? 'desktop' : 'web'}</strong>
      </p>

      <section className="kit-gallery__section">
        <Eyebrow>Eyebrow</Eyebrow>
        <div className="kit-gallery__row">
          <Eyebrow>default · 0.1em</Eyebrow>
          <Eyebrow tight>tight · 0.08em</Eyebrow>
        </div>
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>PartCard</Eyebrow>
        <PartCard kind="thinking" gutter={<span aria-hidden="true">◆</span>}>
          A part frame with a 14px gutter. The content column is
          <code> minmax(0,1fr) </code>, so long unbroken output shrinks instead of
          widening the transcript:
          <code> /very/long/path/that/would/otherwise/blow/out/the/column/width.csv </code>
        </PartCard>
        <PartCard kind="text">A part frame with an empty gutter.</PartCard>
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>KvGrid</Eyebrow>
        <KvGrid
          label="Tool params"
          rows={[
            { key: 'station_id', value: 'MTA1' },
            { key: 'local_path', value: '/staged/earthscope_stations.csv', trailing: '1,101 rows' },
            { key: 'provenance', value: 'osm_nominatim', trailing: 'grounded' },
          ]}
        />
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>Chip</Eyebrow>
        <div className="kit-gallery__row">
          <Chip tone="accent">ares:/scratch/j4471</Chip>
          <Chip tone="accent" onClick={() => {}}>
            async 2
          </Chip>
          <Chip>ctx 41%</Chip>
          <Chip tone="warn">degraded</Chip>
          <Chip tone="error">failed</Chip>
        </div>
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>ToolbarButton</Eyebrow>
        <div className="kit-gallery__row">
          <ToolbarButton label="files" onClick={() => {}} />
          <ToolbarButton label="console" pressed onClick={() => {}} />
          <ToolbarButton label="artifacts 5" onClick={() => {}} />
          <ToolbarButton
            label="Observability"
            iconOnly
            icon={
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1.2 7S3.3 3.2 7 3.2 12.8 7 12.8 7 10.7 10.8 7 10.8 1.2 7 1.2 7z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            }
            onClick={() => {}}
          />
        </div>
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>Tabs</Eyebrow>
        <Tabs
          label="Observability"
          activeId={tab}
          onChange={setTab}
          tabs={[
            { id: 'log', label: 'log' },
            { id: 'gantt', label: 'gantt' },
            { id: 'tools', label: 'tools' },
            { id: 'artifacts', label: 'artifacts', badge: 5 },
          ]}
        />
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>Popover · ContextMenu · Splitter</Eyebrow>
        <div className="kit-gallery__row">
          <span className="kit-gallery__anchor">
            <button type="button" className="kit-gallery__btn" onClick={() => setPopoverOpen((v) => !v)}>
              popover (down)
            </button>
            <Popover open={popoverOpen} label="Model" onClose={() => setPopoverOpen(false)}>
              <div className="kit-gallery__menu">
                <button type="button" className="kit-gallery__btn">claude-sonnet-5</button>
                <button type="button" className="kit-gallery__btn">gpt-5.5</button>
              </div>
            </Popover>
          </span>

          <button type="button" className="kit-gallery__btn" onClick={() => setMenuOpen(true)}>
            context menu
          </button>
        </div>

        <div className="kit-gallery__splitrow">
          <div className="kit-gallery__pane" style={{ width: `${railWidth}px` }}>
            rail · {railWidth}px
          </div>
          <Splitter
            label="Rail width"
            value={railWidth}
            min={200}
            max={460}
            onResize={setRailWidth}
          />
          <div className="kit-gallery__pane kit-gallery__pane--grow">content</div>
        </div>

        <ContextMenu
          open={menuOpen}
          x={40}
          y={40}
          items={[
            { id: 'rename', label: 'Rename' },
            { id: 'archive', label: 'Archive' },
            { id: 'pin', label: 'Pin', disabled: true },
            { id: 'delete', label: 'Delete', tone: 'danger' },
          ]}
          onSelect={() => {}}
          onClose={() => setMenuOpen(false)}
        />
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>Select</Eyebrow>
        <div className="kit-gallery__row">
          <Select
            label="Model"
            value={model}
            onChange={setModel}
            options={[
              { id: 'sonnet', label: 'claude-sonnet-5', detail: 'Anthropic' },
              { id: 'opus', label: 'claude-opus-5', detail: 'Anthropic' },
              { id: 'gpt', label: 'gpt-5.5', detail: 'unavailable', disabled: true },
            ]}
          />
        </div>
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>MasterDetail</Eyebrow>
        <MasterDetail
          label="Settings"
          activeId={page}
          onSelect={setPage}
          items={[
            { id: 'providers', label: 'Providers' },
            { id: 'policies', label: 'Policies' },
            { id: 'hooks', label: 'Hooks', badge: 3 },
            { id: 'plugins', label: 'Plugins', hidden: true },
          ]}
          detail={<p>Detail pane for “{page}”. Unbacked pages ship hidden, never dead.</p>}
        />
      </section>

      <section className="kit-gallery__section">
        <Eyebrow>Modal</Eyebrow>
        <div className="kit-gallery__row">
          <button type="button" className="kit-gallery__btn" onClick={() => setOpenModal('default')}>
            default
          </button>
          <button type="button" className="kit-gallery__btn" onClick={() => setOpenModal('danger')}>
            danger
          </button>
          <button type="button" className="kit-gallery__btn" onClick={() => setOpenModal('scroll')}>
            scrolling body
          </button>
        </div>
      </section>

      <Modal
        open={openModal === 'default'}
        title="Default dialog"
        onClose={() => setOpenModal(null)}
        footer={
          <button type="button" className="kit-gallery__btn" onClick={() => setOpenModal(null)}>
            Done
          </button>
        }
      >
        The one 680px scaffold every dialog in the app composes.
      </Modal>

      <Modal
        open={openModal === 'danger'}
        title="Destructive dialog"
        tone="danger"
        onClose={() => setOpenModal(null)}
      >
        The danger variant swaps the hairline to the error ramp.
      </Modal>

      <Modal
        open={openModal === 'scroll'}
        title="Scrolling dialog"
        scrollBody
        onClose={() => setOpenModal(null)}
      >
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i}>Body line {i + 1} — the panel is bounded and the body scrolls.</p>
        ))}
      </Modal>
    </main>
  );
}
