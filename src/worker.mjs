import { workerData, parentPort } from 'node:worker_threads';
import path from 'node:path';
import { transformFileContent } from './core.mjs';

if (parentPort && workerData) {
  const { items, maxPreserveLines } = workerData;
  const results = items.map((item) => {
    try {
      const transformed = transformFileContent(item.path, item.content, maxPreserveLines);
      return {
        index: item.index,
        path: item.path,
        ext: transformed.ext,
        code: transformed.code
      };
    } catch (err) {

      const ext = path.extname(item.path || '').toLowerCase();
      return {
        index: item.index,
        path: item.path,
        ext,
        code: typeof item.content === 'string' ? item.content : ''
      };
    }
  });
  parentPort.postMessage(results);
}
