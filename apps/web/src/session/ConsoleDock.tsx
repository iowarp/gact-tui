import { Icon } from '../kit';
import './owner-surfaces.css';

/** Prototype console geometry with an explicit marker for the missing PTY route. */
export function ConsoleDock({ onClose }: { onClose: () => void }) {
  return (
    <section className="console-dock" data-testid="console-dock" data-unbacked="true" aria-label="console dock">
      <div className="console-dock__resize" aria-hidden="true" />
      <header><span className="console-dock__tab"><Icon name="console" /> bash</span><button type="button" disabled aria-label="New console"><Icon name="plus" /></button><span /><button type="button" aria-label="Close console" onClick={onClose}><Icon name="x" /></button></header>
      <div className="console-dock__body"><span className="console-dock__prompt">$</span><p>Console unavailable — no session shell or PTY wire surface.</p></div>
    </section>
  );
}
