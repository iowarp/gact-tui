import type { ToolInvocation } from '@clio/core/v3';
import { FileCode2Icon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Terminal } from '@/components/ai-elements/terminal';
import { GroundedMessageResponse } from './grounded-message-response';
import {
  outputDiff,
  presentationRecord,
  terminalCommand,
  terminalOutput,
  textBlocks,
} from './tool-result-presentation-model';

/** Render server-declared human output while retaining raw JSON in technical details. */
export function ToolResultPresentation({ tool }: { tool: ToolInvocation }) {
  const output = presentationRecord(tool.output);
  const message = typeof output?.message === 'string' ? output.message.trim() : '';
  const diff = outputDiff(tool.output);
  const blocks = textBlocks(tool.output);
  const terminal = terminalOutput(tool, output);
  const command = terminal === undefined ? undefined : terminalCommand(tool);
  const hasExitCode = typeof output?.exit_code === 'number' || output?.exit_code === null;
  const exitCode = output?.exit_code;
  const timedOut = output?.timed_out === true;
  const progressMessage = tool.progress_message?.trim() ?? '';

  if (!message && !diff && blocks.length === 0 && terminal === undefined && !progressMessage) {
    return null;
  }

  return (
    <div className="space-y-3 border-t px-4 py-3" data-slot="tool-human-result">
      {message ? <p className="text-sm leading-6 text-foreground">{message}</p> : null}
      {progressMessage && tool.state === 'running' ? (
        <Shimmer className="text-sm">{progressMessage}</Shimmer>
      ) : null}
      {blocks.map((text, index) => (
        <GroundedMessageResponse className="text-sm leading-6" key={`${tool.id}:text:${index}`}>
          {text}
        </GroundedMessageResponse>
      ))}
      {diff ? (
        <CodeBlock code={diff.unifiedDiff} language="diff" showLineNumbers>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode2Icon aria-hidden="true" className="size-3.5" />
              <CodeBlockFilename>{diff.path}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton aria-label={`Copy diff for ${diff.path}`} />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      ) : null}
      {terminal !== undefined ? (
        <div className="space-y-1.5">
          <Terminal command={command} isStreaming={tool.state === 'running'} output={terminal} />
          {tool.state !== 'running' && (hasExitCode || timedOut) ? (
            <p className="font-mono text-xs text-muted-foreground">
              {timedOut ? 'Process timed out.' : `Process exited with code ${String(exitCode)}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
