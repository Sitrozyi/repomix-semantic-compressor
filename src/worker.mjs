import { workerData, parentPort } from 'node:worker_threads';
import { transformFileContent } from './core.mjs';

if (parentPort && workerData) {
  const { items, maxPreserveLines } = workerData;
  const results = items.map((item) => {
    const transformed = transformFileContent(item.path, item.content, maxPreserveLines);
    return {
      index: item.index,
      path: item.path,
      ext: transformed.ext,
      code: transformed.code
    };
  });
  parentPort.postMessage(results);
}
