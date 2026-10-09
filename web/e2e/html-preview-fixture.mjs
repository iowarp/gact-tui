import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Opt-in HTML document transport for browser regression and manual review. */
export function createHtmlPreviewFixture({
  artifactRecord,
  sessionId,
  workspaceId,
  sendJson,
  commonHeaders,
}) {
  let enabled = false;
  let conversions = 0;
  let networkRequests = 0;
  const bytes = readFileSync(
    new URL('../tests/fixtures/document-preview/animated.html', import.meta.url),
  );
  const name = 'cat-riding-a-bike.html';
  const id = artifactRecord.head_artifact_id;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const record = {
    ...artifactRecord,
    name,
    kind: 'report',
    media_type: 'text/html',
    versions: artifactRecord.versions.map((version) => ({
      ...version,
      name,
      kind: 'report',
      media_type: 'text/html',
      sha256,
      size_bytes: bytes.length,
    })),
  };
  const markdownId = 'artifact_markdown_preview';
  const markdownName = 'investigation.md';
  const markdown = Buffer.from(
    '# Investigation notes\n\nThe original data and conclusions remain linked.\n',
  );
  const markdownHash = createHash('sha256').update(markdown).digest('hex');
  const markdownRecord = {
    ...record,
    name: markdownName,
    media_type: 'text/markdown',
    head_artifact_id: markdownId,
    versions: record.versions.map((version) => ({
      ...version,
      artifact_id: markdownId,
      name: markdownName,
      media_type: 'text/markdown',
      sha256: markdownHash,
      size_bytes: markdown.length,
      uri: `artifact://${markdownId}`,
      fetch_url: `/v1/artifacts/${markdownId}/bytes`,
    })),
  };
  return {
    reset() {
      enabled = false;
      conversions = 0;
      networkRequests = 0;
    },
    async handle(request, response, url) {
      if (url.pathname === '/__test/html-preview' && request.method === 'POST') {
        enabled = true;
        sendJson(response, { enabled });
        return true;
      }
      if (!enabled) return false;
      if (url.pathname === '/preview-network-trap') {
        networkRequests += 1;
        response.writeHead(204, commonHeaders());
        response.end();
      } else if (url.pathname === '/__test/html-preview' && request.method === 'GET') {
        sendJson(response, { conversions, networkRequests });
      } else if (request.method !== 'GET' && url.pathname.endsWith('/renditions')) {
        conversions += 1;
        sendJson(response, { detail: 'HTML preview must not request a PDF.' }, 500);
      } else if (url.pathname === `/v1/sessions/${sessionId}/artifacts`) {
        sendJson(response, {
          artifacts: [record, markdownRecord],
          used: [],
          count: 2,
          include_children: true,
          child_session_ids: [],
          next_cursor: null,
        });
      } else if (url.pathname === `/v1/artifacts/${markdownId}`) {
        sendJson(response, { artifact: markdownRecord, resolved: markdownRecord.versions[0] });
      } else if (url.pathname === `/v1/artifacts/${markdownId}/document`) {
        sendJson(response, {
          artifact_id: markdownId,
          workspace_id: workspaceId,
          name: markdownName,
          version: 1,
          sha256: markdownHash,
          mime_type: 'text/markdown',
          profile: 'markdown',
          content_url: `/v1/artifacts/${markdownId}/document/content`,
          anchors: ['text-quote'],
          native_open: true,
          embedded_editors: ['onlyoffice'],
          rendition_formats: ['pdf'],
          provenance: {},
        });
      } else if (
        [
          `/v1/artifacts/${markdownId}/bytes`,
          `/v1/artifacts/${markdownId}/document/content`,
        ].includes(url.pathname)
      ) {
        response.writeHead(200, commonHeaders('text/markdown'));
        response.end(markdown);
      } else if (url.pathname === `/v1/artifacts/${markdownId}/reviews`) {
        sendJson(response, { reviews: [] });
      } else if (url.pathname === `/v1/artifacts/${id}`) {
        sendJson(response, { artifact: record, resolved: record.versions[0] });
      } else if (url.pathname === `/v1/artifacts/${id}/document`) {
        sendJson(response, {
          artifact_id: id,
          workspace_id: workspaceId,
          name,
          version: 1,
          sha256,
          mime_type: 'text/html',
          profile: 'html-static',
          content_url: `/v1/artifacts/${id}/document/content`,
          anchors: [],
          native_open: true,
          embedded_editors: [],
          rendition_formats: ['pdf'],
          pdf_rendition_artifact_id: '',
          provenance: {},
        });
      } else if (
        [`/v1/artifacts/${id}/bytes`, `/v1/artifacts/${id}/document/content`].includes(url.pathname)
      ) {
        response.writeHead(200, commonHeaders('text/html'));
        response.end(bytes);
      } else if (url.pathname === `/v1/artifacts/${id}/reviews`) {
        sendJson(response, { reviews: [] });
      } else return false;
      return true;
    },
  };
}
