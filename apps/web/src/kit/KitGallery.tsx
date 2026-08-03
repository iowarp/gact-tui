import { useState } from 'react';
import { Eyebrow, KvGrid, Modal, PartCard, useIsDesktop } from './index';
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
        <Eyebrow>Modal</Eyebrow>
        <div className="kit-gallery__row">
          <button type="button" onClick={() => setOpenModal('default')}>
            default
          </button>
          <button type="button" onClick={() => setOpenModal('danger')}>
            danger
          </button>
          <button type="button" onClick={() => setOpenModal('scroll')}>
            scrolling body
          </button>
        </div>
      </section>

      <Modal
        open={openModal === 'default'}
        title="Default dialog"
        onClose={() => setOpenModal(null)}
        footer={
          <button type="button" onClick={() => setOpenModal(null)}>
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
