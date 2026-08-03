/**
 * Inspector 'Bindings' tab: edit a session's blueprint/expert bindings.
 * Exports {@link BindingsTab}.
 */
import { InspectorBindingProvenance } from './InspectorBindingProvenance.js';
import { InspectorBindingSelect } from './InspectorBindingSelect.js';
import { InspectorPackagedProvenance } from './InspectorPackagedProvenance.js';
import type { SessionBindings } from './InspectorBindingsModel.js';

export type {
  BindingOption,
  PackagedProvenance,
  SessionBindings,
} from './InspectorBindingsModel.js';

/** Per-session blueprint + expert-pack bindings. */
export function BindingsTab(props: {
  bindings: SessionBindings;
  onSetBlueprint?: (id: string | null) => void | Promise<void>;
  onSetExpertPack?: (id: string | null) => void | Promise<void>;
}) {
  return (
    <section class="inspector__sect">
      <InspectorBindingSelect
        title="Agent blueprint"
        value={props.bindings.blueprint_id}
        options={props.bindings.availableBlueprints}
        testId="binding-blueprint"
        onSetValue={props.onSetBlueprint}
      />
      <InspectorBindingSelect
        title="Expert pack"
        value={props.bindings.pack_id}
        options={props.bindings.availablePacks}
        testId="binding-expert-pack"
        onSetValue={props.onSetExpertPack}
      />
      <InspectorBindingProvenance bindings={props.bindings} />
      <InspectorPackagedProvenance packaged={props.bindings.packaged} />
    </section>
  );
}
