import type { ManagedServiceDefinition } from '@clio/core/v3';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { instanceNameProblem } from './managed-service-gpus';
import { t, ph } from '@lingui/core/macro';

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
      aria-label={t`Add ${ph({ label: service.label })} instance`}
      className="flex basis-full flex-wrap items-end gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!problem) onSubmit(value);
      }}
    >
      <Field className="w-full sm:w-64">
        <FieldLabel htmlFor={id}>{t`Instance name`}</FieldLabel>
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
          ) : value ? (
            t`Deploys as ${ph({ id: service.id })}@${value}`
          ) : (
            t`Deploys as ${ph({ id: service.id })}@name`
          )}
        </FieldDescription>
      </Field>
      <Button size="sm" type="submit">
        {t`Continue`}
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
        {t`Cancel`}
      </Button>
    </form>
  );
}
