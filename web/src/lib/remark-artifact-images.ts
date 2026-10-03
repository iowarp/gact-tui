export const ARTIFACT_IMAGE_PATH = '/__clio_artifact_image__/';

interface MarkdownNode {
  type: string;
  url?: string;
  children?: MarkdownNode[];
}

/** Route artifact images to a local component before generic URL sanitization. */
export function remarkArtifactImages() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === 'image' && node.url?.startsWith('artifact://')) {
        node.url = `${ARTIFACT_IMAGE_PATH}${encodeURIComponent(node.url)}`;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
