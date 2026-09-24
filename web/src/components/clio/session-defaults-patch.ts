import type { SessionDefaults } from '@clio/core/v3';

/** The session-defaults write: only the fields and values the service accepts. */
export type SessionDefaultsPatch = Partial<Omit<SessionDefaults, 'effort'>> & {
  effort?: SessionDefaults['effort'] | null;
};

/**
 * Build the PATCH body from a form value.
 *
 * Only known fields are sent, so extra fields the response carries (e.g.
 * `degradations`, `effort_source`) never round-trip back and 422. A value this
 * build decoded as `unknown` (a service enum it does not know) is not sent: an
 * unknown effort is reset to the model default (`null`, noted in the form);
 * an unknown mode/policy is left untouched on the service.
 */
export function sessionDefaultsPatch(value: SessionDefaults): SessionDefaultsPatch {
  const patch: SessionDefaultsPatch = {
    provider_id: value.provider_id,
    model_id: value.model_id,
    blueprint_id: value.blueprint_id,
    effort: value.effort && value.effort !== 'unknown' ? value.effort : null,
  };
  if (value.mode !== 'unknown') patch.mode = value.mode;
  if (value.edit_mode !== 'unknown') patch.edit_mode = value.edit_mode;
  if (value.routing_mode !== 'unknown') patch.routing_mode = value.routing_mode;
  if (value.approval_mode !== 'unknown') patch.approval_mode = value.approval_mode;
  return patch;
}
