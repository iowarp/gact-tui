import type { HttpTransport } from './transport.js';

export type SessionTransport = Pick<HttpTransport, 'del' | 'get' | 'post' | 'request'>;
