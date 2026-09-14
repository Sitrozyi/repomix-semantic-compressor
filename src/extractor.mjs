import { XMLParser } from 'fast-xml-parser';

/**
 * Safely decodes XML entities in raw extracted file contents.
 * @param {string} str
 * @returns {string} Decoded string
 */
function decodeXMLEntities(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extracts individual file paths and contents from Repomix XML or JSON artifacts.
 * @param {string} rawContent
 * @param {string} filePath
 * @returns {{ path: string, content: string }[]}
 */
export function extractFiles(rawContent, filePath) {
  if (filePath.endsWith('.json') || rawContent.trim().startsWith('{')) {
    try {
      const data = JSON.parse(rawContent);
      const results = [];
      if (data.files) {
        if (Array.isArray(data.files)) {
          for (const f of data.files) {
            results.push({ path: f.path || 'unknown', content: f.content || '' });
          }
        } else if (typeof data.files === 'object') {
          for (const [p, val] of Object.entries(data.files)) {
            results.push({ path: p, content: typeof val === 'string' ? val : val.content || '' });
          }
        }
      }
      if (results.length > 0) return results;
    } catch {}
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      stopNodes: ['*.file', 'file', 'files.file', 'root.files.file', 'root.file'],
      processEntities: true,
      htmlEntities: true,
      trimValues: false
    });

    const sanitizedXml = rawContent.replace(/<\?xml[\s\S]*?\?>/gi, '').trim();
    const wrappedXml = `<root>${sanitizedXml}</root>`;
    const parsed = parser.parse(wrappedXml);
    const results = [];

    const collectFiles = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) collectFiles(item);
        return;
      }
      if (typeof node === 'object') {
        if (node.file) {
          const files = Array.isArray(node.file) ? node.file : [node.file];
          for (const f of files) {
            if (typeof f === 'object') {
              const filePathAttr = f['@_path'] || f.path || 'unknown';
              let fileContent = typeof f['#text'] === 'string' ? f['#text'] : (typeof f === 'string' ? f : '');
              results.push({ path: filePathAttr, content: decodeXMLEntities(fileContent) });
            }
          }
        }
        for (const key of Object.keys(node)) {
          if (key !== 'file' && typeof node[key] === 'object') {
            collectFiles(node[key]);
          }
        }
      }
    };

    collectFiles(parsed.root || parsed);
    if (results.length > 0) return results;
  } catch {}

  const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  const results = [];
  let m;
  while ((m = fileRegex.exec(rawContent)) !== null) {
    results.push({ path: m[1], content: decodeXMLEntities(m[2]) });
  }
  return results;
}
