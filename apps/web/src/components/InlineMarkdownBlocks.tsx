/**
 * UI component: Inline Markdown Blocks. Exports `MarkdownBlock`.
 */
import { For } from 'solid-js';
import { CodeBlock } from './InlineMarkdownCodeBlock.js';
import { splitLines, tokenizeInline, type Block, type InlineToken } from './InlineMarkdownModel.js';

export function MarkdownBlock(props: { block: Block }) {
  const block = props.block;
  switch (block.kind) {
    case 'code':
      return <CodeBlock lang={block.lang} body={block.body} />;
    case 'heading': {
      const content = <For each={tokenizeInline(block.body)}>{(t) => <InlineTokenView token={t} />}</For>;
      if (block.level === 1) {
        return <h2 class="im__h im__h-1">{content}</h2>;
      }
      if (block.level === 2) {
        return <h3 class="im__h im__h-2">{content}</h3>;
      }
      return <h4 class="im__h im__h-3">{content}</h4>;
    }
    case 'list':
      return <MarkdownList block={block} />;
    case 'hr':
      return <hr class="im__hr" />;
    case 'quote':
      return <MarkdownQuote body={block.body} />;
    case 'table':
      return <MarkdownTable block={block} />;
    case 'text':
    default:
      return <MarkdownParagraph body={block.body} />;
  }
}

function MarkdownList(props: { block: Extract<Block, { kind: 'list' }> }) {
  // Detect a markdown task list — all items start with `[ ] ` or `[x] `.
  const taskListRe = /^\[([ xX])\]\s+(.*)$/;
  const isTaskList = () =>
    !props.block.ordered &&
    props.block.items.length > 0 &&
    props.block.items.every((item) => taskListRe.test(item));
  const items = (
    <For each={props.block.items}>
      {(item) => {
        if (isTaskList()) {
          const match = item.match(taskListRe)!;
          const checked = match[1]!.toLowerCase() === 'x';
          const body = match[2]!;
          return (
            <li class={'im__li im__li--task ' + (checked ? 'is-done' : '')}>
              <span class={'im__check ' + (checked ? 'is-checked' : '')} aria-hidden />
              <span>
                <InlineTokens text={body} />
              </span>
            </li>
          );
        }
        return (
          <li class="im__li">
            <InlineTokens text={item} />
          </li>
        );
      }}
    </For>
  );
  const className = () =>
    'im__list ' +
    (props.block.ordered ? 'im__list--ol' : 'im__list--ul') +
    (isTaskList() ? ' im__list--tasks' : '');
  if (props.block.ordered) {
    return <ol class={className()}>{items}</ol>;
  }
  return <ul class={className()}>{items}</ul>;
}

function MarkdownQuote(props: { body: string }) {
  return (
    <blockquote class="im__quote">
      <For each={splitLines(props.body)}>
        {(line, i) => (
          <>
            {i() > 0 && <br />}
            <InlineTokens text={line} />
          </>
        )}
      </For>
    </blockquote>
  );
}

function MarkdownTable(props: { block: Extract<Block, { kind: 'table' }> }) {
  return (
    <table class="im__table">
      <thead>
        <tr>
          <For each={props.block.header}>
            {(cell) => (
              <th>
                <InlineTokens text={cell} />
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={props.block.rows}>
          {(row) => (
            <tr>
              <For each={row}>
                {(cell) => (
                  <td>
                    <InlineTokens text={cell} />
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

function MarkdownParagraph(props: { body: string }) {
  return (
    <p class="im__p">
      <For each={splitLines(props.body)}>
        {(line, i) => (
          <>
            {i() > 0 && <br />}
            <InlineTokens text={line} />
          </>
        )}
      </For>
    </p>
  );
}

function InlineTokens(props: { text: string }) {
  return <For each={tokenizeInline(props.text)}>{(t) => <InlineTokenView token={t} />}</For>;
}

function InlineTokenView(props: { token: InlineToken }) {
  const token = () => props.token;
  switch (token().kind) {
    case 'bold':
      return <strong>{token().text}</strong>;
    case 'italic':
      return <em>{token().text}</em>;
    case 'code':
      return <code class="im__inline-code">{token().text}</code>;
    case 'strike':
      return <s class="im__strike">{token().text}</s>;
    case 'highlight':
      return <mark class="im__highlight">{token().text}</mark>;
    case 'link':
      return (
        <a class="im__link" href={token().href} target="_blank" rel="noopener noreferrer">
          {token().text}
        </a>
      );
    case 'plain':
    default:
      return <span>{token().text}</span>;
  }
}
