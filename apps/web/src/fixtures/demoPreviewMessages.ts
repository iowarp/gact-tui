/**
 * Demo/fixture data (demo Preview Messages) for offline rendering and visual tests; not used against a live backend.
 */
import type { Message } from '@clio/core';

const INLINE_CHART_SVG =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iMTMwIiB2aWV3Qm94PSIwIDAgNDIwIDEzMCI+PHJlY3Qgd2lkdGg9IjQyMCIgaGVpZ2h0PSIxMzAiIHJ4PSIxNiIgZmlsbD0iIzA3MTExZiIvPjxwYXRoIGQ9Ik0zNSA5MiBDOTUgNTAgMTM1IDc4IDE4MyA0MCBTMjc2IDIwIDM0MiA2MiBTMzg3IDgyIDM5NyA0NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBkNGRiIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjgyIiBjeT0iNzIiIHI9IjciIGZpbGw9IiMzNGQzOTkiLz48Y2lyY2xlIGN4PSIxODMiIGN5PSI0MCIgcj0iNyIgZmlsbD0iI2ZiYmYyNCIvPjxjaXJjbGUgY3g9IjM0MiIgY3k9IjYyIiByPSI3IiBmaWxsPSIjZWE3YjJhIi8+PHRleHQgeD0iMjgiIHk9IjI4IiBmaWxsPSIjZDdlMmZmIiBmb250LWZhbWlseT0iSW50ZXIsQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZvbnQtd2VpZ2h0PSI3MDAiPkdOU1MgbW90aW9uIHByZXZpZXc8L3RleHQ+PHRleHQgeD0iMjgiIHk9IjExNiIgZmlsbD0iIzdjYTZkOSIgZm9udC1mYW1pbHk9IkludGVyLEFyaWFsIiBmb250LXNpemU9IjEyIj5yZW5kZXJlZCBpbmxpbmUgZnJvbSBhbiBpbWFnZSBwYXJ0PC90ZXh0Pjwvc3ZnPg==';

export function previewDemoMessages(normal: Message[]): Message[] {
  return [
    ...normal,
    {
      id: 'm-user-retry',
      role: 'user',
      metadata: { retry_attempt_id: 'attempt_demo_1' },
      parts: [
        {
          type: 'text',
          text: 'Read src/handlers.go and rewrite the println calls to use log.Info.\n\n[Retry notes]\nUse structured logging with zap instead.',
        },
      ],
    },
    {
      id: 'm-asst-image',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Here is the chart you asked for:' },
        {
          type: 'image',
          source: {
            kind: 'base64',
            media_type: 'image/svg+xml',
            data: INLINE_CHART_SVG,
          },
        },
        {
          type: 'image',
          source: { kind: 'file_id', file_id: 'file_abc123' },
        },
      ],
    },
  ];
}
