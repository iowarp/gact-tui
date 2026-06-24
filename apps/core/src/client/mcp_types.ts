import type { McpServerInfo } from '../wire/types.js';

export interface InstallMcpServerInput {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServersResult {
  servers: McpServerInfo[];
}

export type InstallMcpServerResult = McpServerInfo;

export interface ReconnectMcpServerResult {
  status?: string;
  error?: string;
}

export interface McpServerToolList {
  tools: Array<{
    name: string;
    description?: string;
    schema?: Record<string, unknown>;
  }>;
}

export interface McpResourceList {
  resources: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
}

export interface McpPromptList {
  prompts: Array<{
    name: string;
    description?: string;
  }>;
}

export interface McpReadResourceResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
}

export interface McpResourceTemplateList {
  templates: Array<{
    uriTemplate: string;
    name?: string;
    description?: string;
  }>;
}

export interface McpGetPromptResult {
  description?: string;
  messages: Array<{
    role: string;
    content: {
      type: string;
      text?: string;
    };
  }>;
}

export type McpPromptArgs = Record<string, unknown>;

export interface CallMcpToolInput {
  tool: string;
  args?: Record<string, unknown>;
  sessionId?: string;
}

export interface CallMcpToolResult {
  result?: unknown;
  error?: {
    message: string;
    code?: string;
  };
  is_error?: boolean;
}
