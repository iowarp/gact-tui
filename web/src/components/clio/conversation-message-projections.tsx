import { m } from 'motion/react';
import { McpAppResponseActivity, type McpAppResponseActivityData } from './mcp-app-surface';

/** Preserve transcript positioning while replacing a transport bubble with ledger activity. */
export function McpAppResponseMessageRow({
  index,
  measureElement,
  messageId,
  recent,
  response,
  start,
  virtualized,
}: {
  index: number;
  measureElement?: (element: Element | null) => void;
  messageId: string;
  recent: boolean;
  response: McpAppResponseActivityData;
  start?: number;
  virtualized: boolean;
}) {
  return (
    <div
      className={`${virtualized ? 'absolute left-0 top-0' : 'relative'} w-full px-5 pb-4 pt-1 outline-none target:rounded-xl target:ring-2 target:ring-primary/50 lg:px-8`}
      data-index={index}
      id={`message-${messageId}`}
      ref={measureElement}
      style={virtualized ? { transform: `translateY(${start ?? 0}px)` } : undefined}
      tabIndex={-1}
    >
      <m.div
        animate={{ opacity: 1 }}
        initial={{ opacity: recent ? 0 : 1 }}
        transition={{ duration: 0.16 }}
      >
        <McpAppResponseActivity response={response} />
      </m.div>
    </div>
  );
}
