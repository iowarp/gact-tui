import type { ApprovalRequest, UserQuestion } from '@clio/core/v3';
import { ShieldAlertIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import {
  Queue,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ClioStatus } from './status';

type PermissionAction = 'allow' | 'deny' | 'allow_session' | 'allow_workspace';

export interface ClioPendingInteractionsProps {
  approvals: readonly ApprovalRequest[];
  questions: readonly UserQuestion[];
  listedSessionIds?: ReadonlySet<string>;
  disabled?: boolean;
  onApproval: (id: string, action: PermissionAction) => Promise<void>;
  onAnswer: (id: string, answer: { answer?: string; selected_options?: string[] }) => Promise<void>;
  onCancelQuestion: (id: string) => Promise<void>;
}

export function ClioPendingInteractions({
  approvals,
  questions,
  listedSessionIds,
  disabled,
  onApproval,
  onAnswer,
  onCancelQuestion,
}: ClioPendingInteractionsProps) {
  if (approvals.length === 0 && questions.length === 0) return null;
  const responseCount = approvals.length + questions.length;

  return (
    <Queue
      aria-label="Agent needs your response"
      aria-live="polite"
      className="relative z-10 mx-auto -mb-px min-h-0 w-[calc(100%_-_1.5rem)] max-w-[54.5rem] shrink rounded-b-none border-b-0 bg-card py-0.5 dark:bg-card"
      role="region"
    >
      <QueueSection className="flex min-h-0 flex-col" defaultOpen={false}>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={responseCount}
            icon={<ShieldAlertIcon aria-hidden="true" className="size-3.5" />}
            label={responseCount === 1 ? 'response needed' : 'responses needed'}
          />
        </QueueSectionTrigger>
        <QueueSectionContent className="flex min-h-0 flex-col">
          <ScrollArea
            className="min-h-0 shrink"
            scrollHideDelay={500}
            type="hover"
            viewportProps={{
              'aria-label': `${responseCount} pending responses`,
              className: 'overscroll-contain',
              role: 'region',
              tabIndex: 0,
            }}
          >
            <div className="flex flex-col gap-2 px-1 pb-1">
              {approvals.map((approval) => (
                <Confirmation
                  approval={{ id: approval.id }}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 bg-background/70"
                  key={approval.id}
                  state="approval-requested"
                >
                  <ShieldAlertIcon aria-hidden="true" className="size-4 text-action" />
                  <ConfirmationTitle className="min-w-0">
                    <span
                      className="block truncate font-medium"
                      data-slot="pending-interaction-title"
                      title={approval.summary}
                    >
                      {approval.summary}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {approval.reason ?? `Protected action: ${approval.tool_name}`}
                    </span>
                    {listedSessionIds && !listedSessionIds.has(approval.session_id) ? (
                      <ClioStatus
                        className="mt-2"
                        detail={`Requested by session ${approval.session_id}`}
                        label="Session not listed yet"
                        value="unavailable"
                      />
                    ) : null}
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Technical details</summary>
                      <p className="mt-1 font-mono">{approval.tool_name}</p>
                      {approval.input === undefined ? null : (
                        <CodeBlock
                          className="mt-2 max-h-40"
                          code={JSON.stringify(approval.input, null, 2)}
                          language="json"
                        >
                          <CodeBlockCopyButton aria-label="Copy protected action details" />
                        </CodeBlock>
                      )}
                    </details>
                  </ConfirmationTitle>
                  <ConfirmationRequest>
                    <ConfirmationActions className="col-span-2 mt-1 flex-wrap">
                      <ConfirmationAction
                        disabled={disabled}
                        onClick={() => void onApproval(approval.id, 'deny')}
                        variant="destructive"
                      >
                        Deny
                      </ConfirmationAction>
                      <ConfirmationAction
                        disabled={disabled}
                        onClick={() => void onApproval(approval.id, 'allow_workspace')}
                        variant="outline"
                      >
                        Allow for workspace
                      </ConfirmationAction>
                      <ConfirmationAction
                        disabled={disabled}
                        onClick={() => void onApproval(approval.id, 'allow_session')}
                        variant="outline"
                      >
                        Allow for session
                      </ConfirmationAction>
                      <ConfirmationAction
                        disabled={disabled}
                        onClick={() => void onApproval(approval.id, 'allow')}
                      >
                        Allow once
                      </ConfirmationAction>
                    </ConfirmationActions>
                  </ConfirmationRequest>
                </Confirmation>
              ))}
              {questions.map((question) => (
                <QuestionResponse
                  disabled={disabled}
                  key={question.id}
                  onAnswer={onAnswer}
                  onCancel={onCancelQuestion}
                  question={question}
                />
              ))}
            </div>
          </ScrollArea>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

function QuestionResponse({
  question,
  disabled,
  onAnswer,
  onCancel,
}: {
  question: UserQuestion;
  disabled?: boolean;
  onAnswer: ClioPendingInteractionsProps['onAnswer'];
  onCancel: ClioPendingInteractionsProps['onCancelQuestion'];
}) {
  const [answer, setAnswer] = useState('');
  const [selection, setSelection] = useState('');
  const [optionComments, setOptionComments] = useState<Record<string, string>>({});
  const options = question.options ?? [];
  const usesOptions = options.length > 0 && question.kind !== 'freeform';
  const canSubmit = usesOptions ? Boolean(selection) : Boolean(answer.trim());
  const selectedComment = optionComments[selection]?.trim() ?? '';

  return (
    <Frame dense spacing="sm">
      <FrameHeader className="relative flex-row items-center gap-2 pr-10">
        <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0 text-action" />
        <FrameTitle
          className="min-w-0 flex-1 truncate"
          data-slot="pending-interaction-title"
          title={question.prompt}
        >
          {question.prompt}
        </FrameTitle>
        <Button
          aria-label="Cancel question"
          className="absolute right-2 top-1"
          disabled={disabled}
          onClick={() => void onCancel(question.id)}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </FrameHeader>
      <FramePanel>
        {usesOptions ? (
          <RadioGroup disabled={disabled} onValueChange={setSelection} value={selection}>
            {options.map((option) => {
              const value = option.value || option.label;
              const selected = selection === value;
              return (
                <div
                  className={cn(
                    'rounded-lg border transition-colors hover:bg-muted/50',
                    selected &&
                      'border-primary/30 bg-primary/5 dark:border-primary/20 dark:bg-primary/10',
                  )}
                  key={value}
                >
                  <FieldLabel
                    className="has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border-0 has-[>[data-slot=field]]:hover:bg-transparent has-data-checked:bg-transparent dark:has-data-checked:bg-transparent"
                    htmlFor={`${question.id}-${value}`}
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        aria-label={option.label}
                        id={`${question.id}-${value}`}
                        value={value}
                      />
                      <FieldContent>
                        <FieldTitle>{option.label}</FieldTitle>
                        {option.description ? (
                          <FieldDescription>{option.description}</FieldDescription>
                        ) : null}
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                  {selected ? (
                    <Field className="gap-1 border-t border-border/60 px-2.5 py-2">
                      <FieldLabel
                        className="w-auto text-xs font-normal text-muted-foreground"
                        htmlFor={`${question.id}-${value}-comment`}
                      >
                        Comment on {option.label} (optional)
                      </FieldLabel>
                      <Textarea
                        aria-label={`Comment on ${option.label}`}
                        className="min-h-12 resize-y bg-background/60"
                        disabled={disabled}
                        id={`${question.id}-${value}-comment`}
                        onChange={(event) =>
                          setOptionComments((current) => ({
                            ...current,
                            [value]: event.target.value,
                          }))
                        }
                        placeholder="Add context for the agent"
                        rows={2}
                        value={optionComments[value] ?? ''}
                      />
                    </Field>
                  ) : null}
                </div>
              );
            })}
          </RadioGroup>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${question.id}-answer`}>Your response</FieldLabel>
            <Textarea
              id={`${question.id}-answer`}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type your response"
              value={answer}
            />
          </Field>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            disabled={disabled || !canSubmit}
            onClick={() =>
              void onAnswer(
                question.id,
                usesOptions
                  ? {
                      selected_options: [selection],
                      ...(selectedComment ? { answer: selectedComment } : {}),
                    }
                  : { answer: answer.trim() },
              )
            }
          >
            Send response
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}
