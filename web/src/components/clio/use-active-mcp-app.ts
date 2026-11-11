import type { ClioRepository, McpAppIdentity, Message } from '@clio/core/v3';
import { useEffect, useMemo, useRef } from 'react';

interface ActiveMcpApp {
  id: string;
  identity: McpAppIdentity;
}

/** The latest MCP app block in the transcript, with the identity that closes it. */
function latestMcpApp(messages: readonly Message[]): ActiveMcpApp | undefined {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const block = message?.blocks.findLast((candidate) => candidate.type === 'mcp_app');
    if (block?.type === 'mcp_app' && message) {
      return {
        id: block.app_instance_id,
        identity: {
          appInstanceId: block.app_instance_id,
          dataRef: block.data_ref,
          sessionId: message.session_id,
        },
      };
    }
  }
  return undefined;
}

/**
 * The transcript's latest MCP app, the only one kept live. When a newer app
 * takes its place, the previous one is closed on the repository.
 */
export function useActiveMcpAppId(
  messages: readonly Message[],
  mcpAppRepository: ClioRepository | undefined,
): string | undefined {
  const activeMcpApp = useMemo(() => latestMcpApp(messages), [messages]);
  const activeMcpAppId = activeMcpApp?.id;
  const previousActiveMcpApp = useRef(activeMcpApp);
  useEffect(() => {
    if (!activeMcpApp) return;
    const previous = previousActiveMcpApp.current;
    previousActiveMcpApp.current = activeMcpApp;
    if (!previous || previous.id === activeMcpApp.id || !mcpAppRepository) return;
    void mcpAppRepository.closeMcpApp(previous.identity).catch(() => undefined);
  }, [activeMcpApp, mcpAppRepository]);
  return activeMcpAppId;
}
