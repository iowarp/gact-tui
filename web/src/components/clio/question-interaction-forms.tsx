import { useAttentionDraft } from './attention-drafts';
import type {
  PendingInteraction,
  PendingInteractionField,
  PendingInteractionResponse,
} from '@clio/core/v3';
import { AlertTriangleIcon, ExternalLinkIcon } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { openExternalUrl } from '@/tauri/external-url';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { QuestionResponseFrame as QuestionFrame } from './question-response-frame';

interface QuestionSurfaceProps {
  interaction: PendingInteraction;
  disabled?: boolean;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}

/** Structured MCP elicitation form using the server-projected field schema. */
export function StructuredQuestionResponse(props: QuestionSurfaceProps) {
  const { interaction } = props;
  const fields = interaction.payload?.fields ?? [];
  const [values, setValues] = useAttentionDraft<Record<string, unknown>>(
    `${interaction.id}:form-values`,
    () => initialValues(interaction),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const serverErrors = fieldErrorsFromMessage(props.responseError?.message, fields);
  const errors = { ...serverErrors, ...fieldErrors };

  const submit = async () => {
    const validation = validateFields(fields, values);
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) return;
    const submissionValues = normalizedSubmissionValues(fields, values);
    setSending(true);
    try {
      await props.onResponse(interaction, {
        action: 'answer',
        metadata: Object.fromEntries(
          fields
            .map((field) => [field.name, submissionValues[field.name]] as const)
            .filter((entry) => entry[1] !== undefined),
        ),
      });
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      setFieldErrors(fieldErrorsFromMessage(message, fields));
    } finally {
      setSending(false);
    }
  };

  return (
    <QuestionFrame {...props}>
      <ResponseErrorNotice error={props.responseError} />
      <FieldGroup className="gap-3">
        {fields.map((field) => (
          <SchemaField
            prefix={interaction.id}
            disabled={props.disabled || sending}
            error={errors[field.name]}
            field={field}
            key={field.name}
            onChange={(value) => {
              setValues((current) => ({ ...current, [field.name]: value }));
              setFieldErrors((current) => {
                if (!current[field.name]) return current;
                const next = { ...current };
                delete next[field.name];
                return next;
              });
            }}
            value={values[field.name]}
          />
        ))}
      </FieldGroup>
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={props.disabled || sending} onClick={() => void submit()}>
          {sending ? 'Sending…' : 'Send response'}
        </Button>
      </div>
    </QuestionFrame>
  );
}

/** Explicit URL consent; nothing is opened or fetched during render. */
export function UrlConsentResponse(props: QuestionSurfaceProps) {
  const { interaction } = props;
  const url = interaction.payload?.url ?? '';
  const [navigationError, setNavigationError] = useState('');
  const [sending, setSending] = useState(false);

  const accept = async () => {
    setNavigationError('');
    try {
      await openExternalUrl(url);
    } catch {
      // Whatever the underlying reason (a blocked popup outside Tauri, a
      // rejected open inside it), consent for this specific URL was not
      // acted on — say that, not the bridge's own generic wording.
      setNavigationError('The browser blocked this link. It has not been accepted.');
      return;
    }
    setSending(true);
    try {
      await props.onResponse(interaction, {
        action: 'answer',
        metadata: { elicitation_action: 'accept' },
      });
    } catch (thrown) {
      setNavigationError(thrown instanceof Error ? thrown.message : 'The link was not accepted.');
    } finally {
      setSending(false);
    }
  };

  return (
    <QuestionFrame {...props}>
      {interaction.payload?.punycode_warning ? (
        <Alert className="mb-3" variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Look-alike address warning</AlertTitle>
          <AlertDescription>Check both host forms before opening this link.</AlertDescription>
        </Alert>
      ) : null}
      <dl className="grid gap-2 text-sm">
        <UrlDetail label="Full URL" value={url} />
        {interaction.payload?.punycode_host ? (
          <UrlDetail label="Decoded host" value={interaction.payload.punycode_host} />
        ) : null}
        {interaction.payload?.punycode_host_raw ? (
          <UrlDetail label="ACE host" value={interaction.payload.punycode_host_raw} />
        ) : null}
      </dl>
      {navigationError ? <FieldError className="mt-3">{navigationError}</FieldError> : null}
      <ResponseErrorNotice error={props.responseError} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          disabled={props.disabled || sending}
          onClick={() =>
            void props
              .onResponse(interaction, {
                action: 'answer',
                metadata: { elicitation_action: 'decline' },
              })
              .catch(() => undefined)
          }
          variant="outline"
        >
          Decline
        </Button>
        <Button
          size="sm"
          disabled={props.disabled || sending || !url}
          onClick={() => void accept()}
        >
          <ExternalLinkIcon aria-hidden="true" />
          Open link
        </Button>
      </div>
    </QuestionFrame>
  );
}

function SchemaField({
  prefix,
  disabled,
  error,
  field,
  onChange,
  value,
}: {
  prefix: string;
  disabled?: boolean;
  error?: string;
  field: PendingInteractionField;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const id = `elicitation-${prefix}-${field.name}`;
  const enumValues = field.enum ?? [];
  if (field.multi) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Field className="!w-full" data-invalid={Boolean(error)}>
        <FieldTitle>{field.title}</FieldTitle>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <div className="grid gap-2" data-slot="checkbox-group">
          {enumValues.map((option, index) => {
            const key = String(option);
            const checked = selected.some((item) => Object.is(item, option));
            return (
              <Label
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                htmlFor={`${id}-${index}`}
                key={key}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  id={`${id}-${index}`}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? [...selected, option]
                        : selected.filter((item) => !Object.is(item, option)),
                    )
                  }
                />
                <FieldContent>
                  <FieldTitle>{field.enum_names?.[index] ?? key}</FieldTitle>
                </FieldContent>
              </Label>
            );
          })}
        </div>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (enumValues.length > 0) {
    return (
      <Field className="!w-full" data-invalid={Boolean(error)}>
        <FieldTitle>{field.title}</FieldTitle>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <RadioGroup
          disabled={disabled}
          onValueChange={(next) => onChange(enumValues.find((option) => String(option) === next))}
          value={value === undefined ? '' : String(value)}
        >
          {enumValues.map((option, index) => (
            <Label
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              htmlFor={`${id}-${index}`}
              key={String(option)}
            >
              <RadioGroupItem id={`${id}-${index}`} value={String(option)} />
              <FieldContent>
                <FieldTitle>{field.enum_names?.[index] ?? String(option)}</FieldTitle>
              </FieldContent>
            </Label>
          ))}
        </RadioGroup>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (field.type === 'boolean') {
    return (
      <Field data-invalid={Boolean(error)} orientation="horizontal">
        <Switch
          aria-invalid={Boolean(error)}
          checked={value === true}
          disabled={disabled}
          id={id}
          onCheckedChange={onChange}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{field.title}</FieldLabel>
          {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
          <FieldError>{error}</FieldError>
        </FieldContent>
      </Field>
    );
  }
  // MCP's schema does not distinguish single-line from multiline strings.
  // Default an unconstrained string to the compact, predictable input used by
  // native questions; reserve a textarea for an explicitly long field.
  const textarea =
    field.type === 'string' && field.max_length !== undefined && field.max_length > 160;
  const controlProps = {
    'aria-invalid': Boolean(error),
    disabled,
    id,
    maxLength: field.max_length,
    minLength: field.min_length,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    required: field.required,
    value: value === undefined ? '' : String(value),
  };
  return (
    <Field className="!w-full" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{field.title}</FieldLabel>
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      {textarea ? (
        <Textarea {...controlProps} rows={3} />
      ) : (
        <Input {...controlProps} type={field.type === 'string' ? 'text' : 'number'} />
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function initialValues(interaction: PendingInteraction): Record<string, unknown> {
  const fields = interaction.payload?.fields ?? [];
  const prefills = interaction.payload?.answer_metadata ?? {};
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      prefills[field.name] ??
        field.default ??
        (field.multi ? [] : field.type === 'boolean' ? false : undefined),
    ]),
  );
}

function validateFields(
  fields: readonly PendingInteractionField[],
  values: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.multi && Array.isArray(value)) {
      if (field.min_items !== undefined && value.length < field.min_items) {
        errors[field.name] = `Choose at least ${field.min_items}.`;
        continue;
      }
      if (field.max_items !== undefined && value.length > field.max_items) {
        errors[field.name] = `Choose no more than ${field.max_items}.`;
        continue;
      }
    }
    if (
      field.required &&
      (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
    ) {
      errors[field.name] = 'This field is required.';
      continue;
    }
    if (typeof value === 'string') {
      if (field.min_length !== undefined && value.length < field.min_length)
        errors[field.name] = `Enter at least ${field.min_length} characters.`;
      if (field.max_length !== undefined && value.length > field.max_length)
        errors[field.name] = `Enter no more than ${field.max_length} characters.`;
      if ((field.type === 'number' || field.type === 'integer') && value !== '') {
        const number = Number(value);
        if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number)))
          errors[field.name] =
            field.type === 'integer' ? 'Enter a whole number.' : 'Enter a number.';
      }
    }
  }
  return errors;
}

function normalizedSubmissionValues(
  fields: readonly PendingInteractionField[],
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = values[field.name];
      if ((field.type === 'number' || field.type === 'integer') && typeof value === 'string') {
        return [field.name, value === '' ? undefined : Number(value)];
      }
      return [field.name, value];
    }),
  );
}

function fieldErrorsFromMessage(
  message: string | undefined,
  fields: readonly PendingInteractionField[],
): Record<string, string> {
  if (!message) return {};
  const matched = fields.find(
    (field) => message.includes(`'${field.name}'`) || message.includes(`"${field.name}"`),
  );
  return matched ? { [matched.name]: message } : {};
}

function UrlDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
