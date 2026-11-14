import type { ToolPresentationBlock } from '@clio/core/v3';

// i18n-ignore: the producer's detail-line prefix, matched as written by the service
const WORKING_FOLDER = 'Working directory: ';

/** The folder a command ran in, from the producer's detail line (`Working directory: …`). */
export function terminalWorkingFolder(block: ToolPresentationBlock): string | undefined {
  const detail = block.detail?.trim() ?? '';
  return detail.startsWith(WORKING_FOLDER) ? detail.slice(WORKING_FOLDER.length) : undefined;
}
