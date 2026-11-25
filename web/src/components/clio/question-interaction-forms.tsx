import type {
  PendingInteraction,
  PendingInteractionField,
  PendingInteractionResponse,
} from '@clio/core/v3';
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { openExternalUrl } from '@/tauri/external-url';
import { serverOwnerName } from '@/lib/a2ui/server-surface';
import { cn } from '@/lib/utils';
import { answerWord, binaryPair, type BinaryOption, type BinaryPair } from '@/lib/binary-answers';
import { AskBody, AskButton, AskError, AskFacts, AskOptions, AskSection } from './ask-card';
import { BinaryAsk } from './ask-binary';
import { declaredChoiceContext, withDeclaredChoices } from '@/lib/declared-choices';
import { QuestionChoiceRows, type QuestionChoice } from './question-choice-card';
import { ChoiceEvidence, ChoiceNote } from './question-choice-context';
import { QuestionResponseFrame as QuestionFrame } from './question-response-frame';
import { useQuestionDraftValue } from './question-answer-context';
import { ph, plural, t } from '@lingui/core/macro';

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
  const fields = withDeclaredChoices(interaction, interaction.payload?.fields ?? []);
  const [values, setValues] = useQuestionDraftValue(interaction.id, 'fields', () =>
    initialValues(interaction),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const serverErrors = fieldErrorsFromMessage(props.responseError?.message, fields);
  const errors = { ...serverErrors, ...fieldErrors };
  const loneBoolean = loneBooleanField(fields);
  const answerChoice = loneBoolean ? undefined : answerChoiceField(fields);
  const answerPair = answerChoice ? fieldPair(answerChoice) : undefined;
  // After a failed Send the first field to fix takes focus and comes into view, even when the
  // capped card or a narrow window holds it out of sight.
  const fieldsRef = useRef<HTMLDivElement>(null);
  const revealInvalid = useRef(false);
  useEffect(() => {
    if (!revealInvalid.current) return;
    revealInvalid.current = false;
    const field = fieldsRef.current?.querySelector<HTMLElement>('[data-invalid="true"]');
    if (!field) return;
    // Focusing a radio does not choose it: a yes/no stays unanswered until the person picks.
    const control = field.querySelector<HTMLElement>(
      '[role="radio"], [role="checkbox"], input, textarea, select',
    );
    field.scrollIntoView({ block: 'nearest' });
    control?.focus({ preventScroll: true });
  }, [fieldErrors]);

  const submit = async (override?: Record<string, unknown>) => {
    const current = override ? { ...values, ...override } : values;
    const validation = validateFields(fields, current);
    revealInvalid.current = true;
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) return;
    const submissionValues = normalizedSubmissionValues(fields, current);
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
      revealInvalid.current = true;
      setFieldErrors(fieldErrorsFromMessage(message, fields));
    } finally {
      setSending(false);
    }
  };

  if (loneBoolean) {
    // A yes/no approval is answered only by choosing Yes or No. Nothing is
    // preselected, so no stray Send can submit a default for the person.
    return (
      <QuestionFrame {...props} escapeAnswers>
        <AskError error={props.responseError} />
        {loneBoolean.description ? (
          <AskBody>
            <AskSection className="text-meta text-muted-foreground">
              {loneBoolean.description}
            </AskSection>
          </AskBody>
        ) : null}
        {errors[loneBoolean.name] ? (
          <AskSection className="text-meta text-destructive" role="alert">
            {errors[loneBoolean.name]}
          </AskSection>
        ) : null}
        <BinaryAsk
          accept={{ label: t`Yes`, onChoose: () => submit({ [loneBoolean.name]: true }) }}
          decline={{ label: t`No`, onChoose: () => submit({ [loneBoolean.name]: false }) }}
          disabled={props.disabled}
          label={loneBoolean.title || t`Answer`}
        />
      </QuestionFrame>
    );
  }

  const choice = choiceField(fields);
  if (choice) {
    // One choice is answered by pressing its option. As with yes/no, a pair's Enter picks
    // neither, so no keypress can give a consent the person did not choose.
    const busy = props.disabled || sending;
    const answer = async (value: unknown) => {
      setSending(true);
      try {
        await props.onResponse(interaction, {
          action: 'answer',
          metadata: { [choice.name]: value },
        });
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        setFieldErrors({ [choice.name]: message });
      } finally {
        setSending(false);
      }
    };
    const pair = fieldPair(choice);
    const choiceContext = declaredChoiceContext(interaction, choice.name);
    return (
      <QuestionFrame {...props} escapeAnswers={Boolean(pair)}>
        <AskError error={props.responseError} />
        {choice.description ? (
          <AskBody>
            <AskSection className="text-meta text-muted-foreground">
              {choice.description}
            </AskSection>
          </AskBody>
        ) : null}
        {errors[choice.name] ? (
          <AskSection className="text-meta text-destructive" role="alert">
            {errors[choice.name]}
          </AskSection>
        ) : null}
        <ChoiceNote context={choiceContext} />
        {pair ? (
          <BinaryAsk
            accept={{ label: pair.accept.label, onChoose: () => answer(pair.accept.value) }}
            decline={{ label: pair.decline.label, onChoose: () => answer(pair.decline.value) }}
            disabled={props.disabled}
            label={fieldTitle(choice)}
          />
        ) : (
          <QuestionChoiceRows
            choices={fieldChoices(choice)}
            disabled={busy}
            label={fieldTitle(choice)}
            mode="answer"
            noEnter
            onChoose={(index) => void answer(choice.enum?.[Number(index)])}
          />
        )}
        <ChoiceEvidence context={choiceContext} />
      </QuestionFrame>
    );
  }

  const renderField = (field: PendingInteractionField, compact?: boolean) => (
    <SchemaField
      compact={compact}
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
  );

  if (answerChoice) {
    // The form's one open choice answers it on the shared option rows, which stay in view
    // under a capped card; the other fields (already filled) sit above them, compact.
    const options = answerChoice.enum ?? [];
    const others = fields.filter((field) => field.name !== answerChoice.name);
    const answerContext = declaredChoiceContext(interaction, answerChoice.name);
    return (
      <QuestionFrame {...props} escapeAnswers={Boolean(answerPair)}>
        <AskError error={props.responseError} />
        {answerChoice.description || others.length ? (
          <AskBody>
            {answerChoice.description ? (
              <AskSection className="text-meta text-muted-foreground">
                {answerChoice.description}
              </AskSection>
            ) : null}
            {others.length ? (
              <AskSection className="pb-0.5">
                <FieldGroup className="gap-2.5 text-menu" ref={fieldsRef}>
                  {others.map((field) => renderField(field, true))}
                </FieldGroup>
              </AskSection>
            ) : null}
          </AskBody>
        ) : null}
        {errors[answerChoice.name] ? (
          <AskSection className="text-meta text-destructive" role="alert">
            {errors[answerChoice.name]}
          </AskSection>
        ) : null}
        <ChoiceNote context={answerContext} />
        {answerPair ? (
          <BinaryAsk
            accept={{
              label: answerPair.accept.label,
              onChoose: () => submit({ [answerChoice.name]: answerPair.accept.value }),
            }}
            decline={{
              label: answerPair.decline.label,
              onChoose: () => submit({ [answerChoice.name]: answerPair.decline.value }),
            }}
            disabled={props.disabled}
            label={fieldTitle(answerChoice)}
          />
        ) : (
          <QuestionChoiceRows
            choices={fieldChoices(answerChoice)}
            disabled={props.disabled || sending}
            label={fieldTitle(answerChoice)}
            mode="answer"
            noEnter
            onChoose={(index) => void submit({ [answerChoice.name]: options[Number(index)] })}
          />
        )}
        <ChoiceEvidence context={answerContext} />
      </QuestionFrame>
    );
  }

  return (
    <QuestionFrame {...props}>
      <AskError error={props.responseError} />
      {/* Under the card's cap the fields scroll; Send and the footer stay inside the card. */}
      <AskBody>
        <AskSection className="pb-0.5">
          <FieldGroup className="gap-2.5 text-menu" ref={fieldsRef}>
            {fields.map((field) => renderField(field))}
          </FieldGroup>
        </AskSection>
      </AskBody>
      <AskOptions aria-label={t`Answer`}>
        <AskButton disabled={props.disabled || sending} onClick={() => void submit()} primary>
          {sending ? t`Sending…` : t`Send response`}
        </AskButton>
      </AskOptions>
    </QuestionFrame>
  );
}

/**
 * HS5: why CLIO let this link through, in words. A plugin's own sign-in page,
 * or a page its server serves on this computer, says which plugin vouched for it.
 */
function urlOriginTrust(payload: PendingInteraction['payload']): string | undefined {
  // The plugin's one display name ("Demo scheduler"); its ids stay out of the sentence.
  const name =
    payload?.plugin || payload?.server
      ? serverOwnerName({
          plugin: payload.plugin ?? '',
          plugin_title: payload.plugin_title,
          server: payload.server ?? '',
        })
      : '';
  switch (payload?.origin_trust) {
    case 'configured':
      return t`It is a trusted address in your settings`;
    case 'plugin_origin':
      return name
        ? t`${ph({ name })} names this address as its own`
        : t`A plugin names this address as its own`;
    case 'plugin_loopback':
      return name
        ? t`It is on this computer, served by ${ph({ name })}`
        : t`It is on this computer, served by a plugin`;
    default:
      return undefined;
  }
}

/**
 * A form that is only one choice of two or three plain options answers by its buttons:
 * pressing an option sends it. Live 2026-11-19, "Allow searches through the literature
 * sources?" was a radio list, a "Choice" heading and a separate Send response.
 */
function fieldPair(field: PendingInteractionField): BinaryPair<BinaryOption<unknown>> | undefined {
  // Options that say what they mean (relay's spend approval) keep that line on the choice rows.
  if (field.enum_descriptions?.some((line) => line?.trim())) return undefined;
  const values = field.enum ?? [];
  const pair = binaryPair(
    values.map((value, index) => ({
      value,
      label: optionLabel(field, value, index),
    })),
  );
  // Paired on the producer's English words; shown in the interface language.
  return pair
    ? {
        accept: { ...pair.accept, label: answerWord(pair.accept.label) },
        decline: { ...pair.decline, label: answerWord(pair.decline.label) },
      }
    : undefined;
}

/** A bare schema id (`compute_job`) read as words (`Compute job`); other text stays as written. */
function readableId(id: string): string {
  if (!/^[a-z0-9]+(?:[_.-][a-z0-9]+)*$/u.test(id)) return id;
  const words = id.replace(/[_.-]+/gu, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What a field is called: its schema title, never the bare id the title falls back to. */
function fieldTitle(field: PendingInteractionField): string {
  const title = field.title?.trim();
  return title && title !== field.name ? title : readableId(field.name);
}

/** An option as the person reads it: its declared name, else its value as words. */
function optionLabel(field: PendingInteractionField, value: unknown, index: number): string {
  const named = field.enum_names?.[index]?.trim();
  if (named) return named;
  return typeof value === 'string' ? readableId(value) : String(value);
}

/** A field's options on the shared choice rows, the asker's recommendation (else the schema's default) marked. */
function fieldChoices(field: PendingInteractionField): QuestionChoice[] {
  const pick = field.recommended ?? field.default;
  const hasDefault = pick !== undefined && pick !== null;
  return (field.enum ?? []).map((value, index) => ({
    value: String(index),
    label: optionLabel(field, value, index),
    description: field.enum_descriptions?.[index]?.trim() || undefined,
    recommended: hasDefault && Object.is(pick, value),
  }));
}

/** A form that is one single choice answers on its options: pressing one sends it. */
function choiceField(
  fields: readonly PendingInteractionField[],
): PendingInteractionField | undefined {
  const [field] = fields;
  if (fields.length !== 1 || !field || field.multi) return undefined;
  return (field.enum?.length ?? 0) >= 2 ? field : undefined;
}

/** Explicit URL consent; nothing is opened or fetched during render. */
export function UrlConsentResponse(props: QuestionSurfaceProps) {
  const { interaction } = props;
  const url = interaction.payload?.url ?? '';
  const originTrust = urlOriginTrust(interaction.payload);
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
      setNavigationError(t`The browser blocked this link. It has not been accepted.`);
      return;
    }
    setSending(true);
    try {
      await props.onResponse(interaction, {
        action: 'answer',
        metadata: { elicitation_action: 'accept' },
      });
    } catch (thrown) {
      setNavigationError(thrown instanceof Error ? thrown.message : t`The link was not accepted.`);
    } finally {
      setSending(false);
    }
  };

  return (
    <QuestionFrame {...props} escapeAnswers>
      {interaction.payload?.punycode_warning ? (
        <AskSection
          className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-warning"
          role="note"
        >
          <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="font-medium">{t`Look-alike address warning`}</span>
          <span className="truncate text-muted-foreground">
            {t`Check both host forms before opening this link.`}
          </span>
        </AskSection>
      ) : null}
      <AskFacts
        facts={[
          { label: t`Full URL`, icon: <LinkIcon />, value: url, title: url, mono: true },
          ...(interaction.payload?.origin
            ? [
                {
                  label: t`Origin`,
                  icon: <GlobeIcon />,
                  value: interaction.payload.origin,
                  title: interaction.payload.origin,
                  mono: true,
                },
              ]
            : []),
          ...(originTrust
            ? [
                {
                  label: t`Trusted because`,
                  icon: <ShieldCheckIcon />,
                  value: originTrust,
                  wrap: true,
                },
              ]
            : []),
          ...(interaction.payload?.punycode_host
            ? [{ label: t`Decoded host`, value: interaction.payload.punycode_host, mono: true }]
            : []),
          ...(interaction.payload?.punycode_host_raw
            ? [{ label: t`ACE host`, value: interaction.payload.punycode_host_raw, mono: true }]
            : []),
        ]}
      />
      {navigationError ? (
        <AskSection className="mt-2 text-meta text-destructive" role="alert">
          {navigationError}
        </AskSection>
      ) : null}
      <AskError error={props.responseError} />
      <BinaryAsk
        accept={{
          disabled: !url,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              {t`Open link`}
            </span>
          ),
          name: t`Open link`,
          onChoose: accept,
        }}
        decline={{
          label: t`Decline`,
          onChoose: () =>
            props.onResponse(interaction, {
              action: 'answer',
              metadata: { elicitation_action: 'decline' },
            }),
        }}
        disabled={props.disabled || sending}
        enterAccepts
        label={t`Link`}
      />
    </QuestionFrame>
  );
}

function SchemaField({
  compact,
  prefix,
  disabled,
  error,
  field,
  onChange,
  value,
}: {
  /** A single choice's options flow on one line where they fit. */
  compact?: boolean;
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
      <Field className="!w-full scroll-my-6" data-invalid={Boolean(error)}>
        <FieldTitle>{fieldTitle(field)}</FieldTitle>
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
                  <FieldTitle>{optionLabel(field, key, index)}</FieldTitle>
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
      <Field className="!w-full scroll-my-6" data-invalid={Boolean(error)}>
        <FieldTitle>{fieldTitle(field)}</FieldTitle>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <RadioGroup
          className={compact ? 'flex flex-wrap gap-x-4 gap-y-1' : undefined}
          disabled={disabled}
          onValueChange={(next) => onChange(enumValues.find((option) => String(option) === next))}
          value={value === undefined ? '' : String(value)}
        >
          {enumValues.map((option, index) => (
            <Label
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50',
                !compact && 'w-full',
              )}
              htmlFor={`${id}-${index}`}
              key={String(option)}
            >
              <RadioGroupItem id={`${id}-${index}`} value={String(option)} />
              <FieldContent>
                <FieldTitle>{optionLabel(field, option, index)}</FieldTitle>
              </FieldContent>
            </Label>
          ))}
        </RadioGroup>
        <FieldError>{error}</FieldError>
      </Field>
    );
  }
  if (field.type === 'boolean') {
    // Yes and No are separate choices so an unanswered field never reads as "no".
    return (
      <Field className="!w-full scroll-my-6" data-invalid={Boolean(error)}>
        <FieldTitle id={`${id}-title`}>{fieldTitle(field)}</FieldTitle>
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        <RadioGroup
          aria-invalid={Boolean(error)}
          // i18n-ignore: element id, not copy
          aria-labelledby={`${id}-title`}
          className="flex flex-wrap gap-x-4 gap-y-1"
          disabled={disabled}
          onValueChange={(next) => onChange(next === 'yes')}
          value={value === true ? 'yes' : value === false ? 'no' : ''}
        >
          {(['yes', 'no'] as const).map((option) => (
            <Label
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              htmlFor={`${id}-${option}`}
              key={option}
            >
              <RadioGroupItem id={`${id}-${option}`} value={option} />
              <span>{option === 'yes' ? t`Yes` : t`No`}</span>
            </Label>
          ))}
        </RadioGroup>
        <FieldError>{error}</FieldError>
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
    <Field className="!w-full scroll-my-6" data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{fieldTitle(field)}</FieldLabel>
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
  const fields = withDeclaredChoices(interaction, interaction.payload?.fields ?? []);
  const prefills = interaction.payload?.answer_metadata ?? {};
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      // A yes/no answer is never preselected: the server's default (often
      // `false`) would otherwise be submitted as if the person had chosen it.
      field.type === 'boolean' && !field.multi && !field.enum?.length
        ? undefined
        : (prefills[field.name] ?? field.default ?? (field.multi ? [] : undefined)),
    ]),
  );
}

function loneBooleanField(
  fields: readonly PendingInteractionField[],
): PendingInteractionField | undefined {
  const [only] = fields;
  return fields.length === 1 && only.type === 'boolean' && !only.multi && !only.enum?.length
    ? only
    : undefined;
}

/**
 * The one open choice of a form whose other fields need no answer from the person (relay's
 * approval with a setting folded in, say): choosing it answers the form.
 */
function answerChoiceField(
  fields: readonly PendingInteractionField[],
): PendingInteractionField | undefined {
  if (fields.length < 2) return undefined;
  const choices = fields.filter((field) => !field.multi && (field.enum?.length ?? 0) >= 2);
  const open = choices.filter((field) => field.default === undefined || field.default === null);
  const choice = choices.length === 1 ? choices[0] : open.length === 1 ? open[0] : undefined;
  if (!choice) return undefined;
  return fields.every(
    (field) =>
      field === choice ||
      !field.required ||
      (field.default !== undefined && field.default !== null),
  )
    ? choice
    : undefined;
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
        errors[field.name] = t`Choose at least ${ph({ count: field.min_items })}.`;
        continue;
      }
      if (field.max_items !== undefined && value.length > field.max_items) {
        errors[field.name] = t`Choose no more than ${ph({ count: field.max_items })}.`;
        continue;
      }
    }
    if (
      field.required &&
      (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
    ) {
      errors[field.name] =
        field.type === 'boolean' ? t`Choose Yes or No.` : t`This field is required.`;
      continue;
    }
    if (typeof value === 'string') {
      if (field.min_length !== undefined && value.length < field.min_length)
        errors[field.name] = plural(field.min_length, {
          one: 'Enter at least # character.',
          other: 'Enter at least # characters.',
        });
      if (field.max_length !== undefined && value.length > field.max_length)
        errors[field.name] = plural(field.max_length, {
          one: 'Enter no more than # character.',
          other: 'Enter no more than # characters.',
        });
      if ((field.type === 'number' || field.type === 'integer') && value !== '') {
        const number = Number(value);
        if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number)))
          errors[field.name] =
            field.type === 'integer' ? t`Enter a whole number.` : t`Enter a number.`;
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
