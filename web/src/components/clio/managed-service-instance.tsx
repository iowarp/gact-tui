import type { ManagedServiceDefinition } from '@clio/core/v3';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { instanceNameProblem } from './managed-service-gpus';

/**
 * Name a further deployment of an engine (`vllm@<name>`) before it is set up
 * in the same configure flow as the engine itself.
 */
export function AddInstanceForm({
  service,
  existing,
  onSubmit,
  onCancel,
}: {
  service: ManagedServiceDefinition;
  /** Ids of the deployments already on this computer; their names are taken. */
  existing: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const value = name.trim();
  const problem = instanceNameProblem(value, service, existing);
  const shown = (submitted || Boolean(value)) && problem;
  return (
    <form
      aria-label={`Add ${service.label} instance`}
      className="flex basis-full flex-wrap items-end gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!problem) onSubmit(value);
      }}
    >
      <Field className="w-full sm:w-64">
        <FieldLabel htmlFor={id}>Instance name</FieldLabel>
        <Input
          aria-describedby={`${id}-hint`}
          aria-invalid={Boolean(shown)}
          autoFocus
          id={id}
          maxLength={32}
          onChange={(event) => setName(event.target.value)}
          placeholder="spotter"
          value={name}
        />
        <FieldDescription id={`${id}-hint`}>
          {shown ? (
            <span className="text-destructive" role="alert">
              {problem}
            </span>
          ) : (
            `Deploys as ${service.id}@${value || 'name'}`
          )}
        </FieldDescription>
      </Field>
      <Button size="sm" type="submit">
        Continue
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
