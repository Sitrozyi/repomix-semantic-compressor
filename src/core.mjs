import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { getEncoding } from 'js-tiktoken';
import {
  optimizeHTML,
  summarizeCSS,
  processJSON,
  optimizeSQL,
  optimizeYAML,
  optimizeDockerfile,
  optimizeMarkdown
} from './optimizers.mjs';
import { skeletonizeWithAST } from './ast.mjs';
import { extractFiles } from './extractor.mjs';
import { extractImports, resolveLocalImportPath, summarizeExports } from './imports.mjs';

export {
  optimizeHTML,
  summarizeCSS,
  processJSON,
  optimizeSQL,
  optimizeYAML,
  optimizeDockerfile,
  optimizeMarkdown
} from './optimizers.mjs';
export { skeletonizeWithAST, extractProtocolsFromAST } from './ast.mjs';
export { extractFiles } from './extractor.mjs';
export { extractImports, resolveLocalImportPath, summarizeExports } from './imports.mjs';

// --- CLI Configuration Specifications ---
const CLI_OPTIONS = {
  input: { type: 'string', short: 'i' },
  output: { type: 'string', short: 'o', default: 'repomix-optimized.md' },
  'max-preserve-lines': { type: 'string', short: 'm', default: '8' },
  focus: { type: 'string', short: 'f' },
  'exact-tokens': { type: 'boolean', short: 'e', default: false },
  'auto-pack': { type: 'boolean', default: true },
  'no-auto-pack': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h' }
};

// --- Terminal Formatting Utilities ---
const styles = {
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  magenta: (t) => `\x1b[35m${t}\x1b[0m`
};

/**
 * Converts raw byte size to a human-readable string (kB, MB, etc.).
 * @param {number} bytes
 * @returns {string} Formatted size string
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Formats LLM token count with thousands separator.
 * @param {number} tokens
 * @returns {string} Formatted token count
 */
export function formatTokens(tokens) {
  return `${(tokens || 0).toLocaleString()}`;
}

let tokenizerInstance = null;
/**
 * Counts LLM tokens. Uses fast byte-length approximation by default (~0ms),
 * or exact cl100k_base BPE tokenization when exact === true.
 * @param {string} text
 * @param {boolean} [exact=false]
 * @returns {number} Token count
 */
export function countTokens(text, exact = false) {
  if (!text || typeof text !== 'string') return 0;
  if (!exact) {
    return Math.round(Buffer.byteLength(text, 'utf-8') / 3.8);
  }
  if (!tokenizerInstance) {
    tokenizerInstance = getEncoding('cl100k_base');
  }
  try {
    return tokenizerInstance.encode(text).length;
  } catch {
    return Math.round(Buffer.byteLength(text, 'utf-8') / 3.8);
  }
}
/**
 * Resolves CLI arguments and determines input/output paths safely.
 * @returns {{ inputFile: string, outputFile: string, maxPreserveLines: number }}
 */
export function resolveConfig() {
  let parsed;
  try {
    parsed = parseArgs({ options: CLI_OPTIONS, allowPositionals: true }).values;
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }

  if (parsed.help) {
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const underline = '\x1b[4m';
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    console.log(`
${bold}Repomix Semantic Compressor (AST-Powered)${reset}
A semantic post-processor for Repomix (${cyan}${underline}https://repomix.com${reset})

${bold}Usage:${reset}
  npx repomix-compress [options]
  node bin/cli.mjs [options]

${bold}Options:${reset}
  -i, --input <path>               Input Repomix file (auto-detects .xml or .json)
  -o, --output <path>              Output optimized file (default: repomix-optimized.md)
  -f, --focus <pattern>            Retain full implementation for matched path/module
  -m, --max-preserve-lines <num>   Max lines to preserve full function body (default: 8)
  -e, --exact-tokens               Use exact BPE tokenizer (slower, default: false)
      --no-auto-pack               Disable automatic repomix execution if artifact is missing
  -h, --help                       Show CLI help and exit

${bold}Examples:${reset}
  ${dim}$${reset} npx repomix-compress
  ${dim}$${reset} npx repomix-compress -f src/auth -o auth-context.md
  ${dim}$${reset} npx repomix-compress -i repomix-output.xml -o context.md
`);
    process.exit(0);
  }

  const autoPack = parsed['no-auto-pack'] ? false : (parsed['auto-pack'] ?? true);
  let inputFile = parsed.input;
  if (!inputFile) {
    inputFile = findDefaultInputFile(autoPack);
  }

  const maxPreserveLines = Number.parseInt(parsed['max-preserve-lines'], 10);
  if (Number.isNaN(maxPreserveLines) || maxPreserveLines < 0) {
    console.error(`error: --max-preserve-lines must be a non-negative integer.`);
    process.exit(1);
  }

  return {
    inputFile,
    outputFile: parsed.output,
    maxPreserveLines,
    focus: parsed.focus || null,
    exactTokens: Boolean(parsed['exact-tokens']),
    autoPack
  };
}

/**
 * Finds default repomix output file or automatically runs repomix by default.
 * @param {boolean} [autoPack=true]
 * @param {string} [baseDir='.']
 * @returns {string} Path to input file
 */
export function findDefaultInputFile(autoPack = true, baseDir = '.', silent = false) {
  const xmlPath = path.normalize(path.join(baseDir, 'repomix-output.xml')).replace(/\\/g, '/');
  const jsonPath = path.normalize(path.join(baseDir, 'repomix-output.json')).replace(/\\/g, '/');

  if (fs.existsSync(xmlPath)) return xmlPath;
  if (fs.existsSync(jsonPath)) return jsonPath;

  if (!autoPack) {
    throw new Error(
      'Repomix output file not found (repomix-output.xml or repomix-output.json).\n' +
      'Please run "npx repomix" first, or omit --no-auto-pack to pack automatically.'
    );
  }

  const packStart = performance.now();
  // Route logs to stderr to avoid corrupting MCP JSON-RPC stdio protocol
  if (!silent) {
    process.stderr.write(`${styles.cyan('ℹ')}  repomix-output not found. Running "npx repomix" automatically... `);
  }

  try {
    execSync('npx repomix', {
      stdio: 'pipe',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });
    const packDuration = ((performance.now() - packStart) / 1000).toFixed(1);
    if (!silent) {
      process.stderr.write(`${styles.gray(`(done in ${packDuration}s)\n`)}`);
    }

    if (fs.existsSync(xmlPath)) return xmlPath;
    if (fs.existsSync(jsonPath)) return jsonPath;
    if (fs.existsSync('repomix-output.xml')) return 'repomix-output.xml';
    if (fs.existsSync('repomix-output.json')) return 'repomix-output.json';
  } catch (err) {
    if (!silent) {
      process.stderr.write('\n');
    }
    const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`Auto-running "npx repomix" failed: ${errMsg}`);
  }
  throw new Error('Repomix completed but neither repomix-output.xml nor repomix-output.json was found.');
}
export function writeToStream(stream, chunk) {
  if (!stream.write(chunk)) {
    return new Promise((resolve) => stream.once('drain', resolve));
  }
  return Promise.resolve();
}

export function transformFileContent(filePath, originalCode, maxPreserveLines) {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath).toLowerCase();
  // Normalize Windows CRLF to standard LF
  const normalizedCode = originalCode.replace(/\r\n/g, '\n');
  let processedCode = '';

  const isDockerfile = baseName === 'dockerfile' || baseName.startsWith('dockerfile.');

  if (isDockerfile) {
    processedCode = optimizeDockerfile(normalizedCode);
  } else if (['.css', '.scss', '.less'].includes(ext)) {
    processedCode = summarizeCSS(normalizedCode);
  } else if (ext === '.html' || ext === '.htm') {
    processedCode = optimizeHTML(normalizedCode);
  } else if (ext === '.json') {
    processedCode = processJSON(normalizedCode);
  } else if (ext === '.sql') {
    processedCode = optimizeSQL(normalizedCode);
  } else if (ext === '.yml' || ext === '.yaml') {
    processedCode = optimizeYAML(normalizedCode);
  } else if (ext === '.md' || ext === '.mdx') {
    processedCode = optimizeMarkdown(normalizedCode);
  } else if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx'].includes(ext)) {
    const isTS = ['.ts', '.mts', '.cts', '.tsx'].includes(ext);
    const isJSX = ['.jsx', '.tsx'].includes(ext);
    processedCode = skeletonizeWithAST(normalizedCode, isTS, maxPreserveLines, isJSX);
  } else {
    processedCode = normalizedCode;
  }

  return {
    ext,
    code: processedCode.replace(/(?:\r?\n){3,}/g, '\n\n').trim()
  };
}


/**
 * Transforms repository files in parallel using worker threads if file count exceeds threshold.
 * Preserves original index order deterministically.
 * @param {{ path: string, content: string }[]} files
 * @param {number} maxPreserveLines
 * @returns {Promise<{ path: string, ext: string, code: string }[]>}
 */
export async function transformFilesParallel(files, maxPreserveLines = 8) {
  if (!files || files.length === 0) return [];

  // Fallback to single thread for small batches to avoid worker initialization overhead
  if (files.length <= 20) {
    return files.map((f) => {
      const transformed = transformFileContent(f.path, f.content, maxPreserveLines);
      return {
        path: f.path,
        ext: transformed.ext,
        code: transformed.code
      };
    });
  }

  const numCPUs = os.cpus()?.length || 4;
  const workerCount = Math.min(4, Math.min(numCPUs, Math.ceil(files.length / 10)));
  const chunkSize = Math.ceil(files.length / workerCount);

  const chunks = [];
  for (let i = 0; i < workerCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, files.length);
    if (start < end) {
      const items = files.slice(start, end).map((file, localIdx) => ({
        index: start + localIdx,
        path: file.path,
        content: file.content
      }));
      chunks.push(items);
    }
  }

  const workerUrl = new URL('./worker.mjs', import.meta.url);
  const activeWorkers = [];

  try {
    // Fall back to sequential execution on the main thread if any worker fails
    const workerPromises = chunks.map((chunk) => {
      return new Promise((resolve) => {
        const worker = new Worker(workerUrl, {
          workerData: { items: chunk, maxPreserveLines }
        });
        activeWorkers.push(worker);
        worker.on('message', (results) => resolve(results));
        worker.on('error', () => {
          // Fallback chunk execution on main thread
          const fallback = chunk.map((item) => {
            const transformed = transformFileContent(item.path, item.content, maxPreserveLines);
            return { index: item.index, path: item.path, ext: transformed.ext, code: transformed.code };
          });
          resolve(fallback);
        });
        worker.on('exit', (code) => {
          if (code !== 0) {
            const fallback = chunk.map((item) => {
              const transformed = transformFileContent(item.path, item.content, maxPreserveLines);
              return { index: item.index, path: item.path, ext: transformed.ext, code: transformed.code };
            });
            resolve(fallback);
          }
        });
      });
    });

    const chunkResults = await Promise.all(workerPromises);
    const allResults = new Array(files.length);
    for (const resList of chunkResults) {
      for (const res of resList) {
        allResults[res.index] = {
          path: res.path,
          ext: res.ext,
          code: res.code
        };
      }
    }

    return allResults;
  } finally {
    await Promise.allSettled(activeWorkers.map((w) => w.terminate()));
  }
}

const TYPE_CONTRACT_REGEX = /(?:^|[\\/])(?:types?|interfaces?|models?|schemas?|constants?|contracts?|entities?)(?:[\\/.]|\.d\.ts$)/i;

function isTypeOrContractDefinition(filePath) {
  return TYPE_CONTRACT_REGEX.test(filePath) || filePath.endsWith('.d.ts');
}

/**
 * Compresses an array of repository files with transitive dependency resolution.
 * @param {{ path: string, content: string }[]} files
 * @param {{ focus?: string|null, maxPreserveLines?: number }} options
 * @returns {Promise<string>}
 */
export async function compressRepository(files, options = {}) {
  const { focus = null, maxPreserveLines = 8 } = options;
  const sections = [
    `[SEMANTIC REPOSITORY SKELETON CONTEXT]\n  Optimized for LLM reasoning & architectural analysis.\n========================================\n\n`
  ];

  if (focus) {
    const fileContentMap = new Map(files.map((f) => [f.path, f.content]));
    const focusFiles = new Set();
    const dependencyFiles = new Set();
    const visited = new Set();
    const traversalQueue = [];

    for (const f of files) {
      if (f.path.includes(focus)) {
        focusFiles.add(f.path);
        visited.add(f.path);
        traversalQueue.push({ path: f.path, depth: 0 });
      }
    }

    while (traversalQueue.length > 0) {
      const current = traversalQueue.shift();
      const content = fileContentMap.get(current.path);
      if (!content) continue;

      const imports = extractImports(content);
      for (const imp of imports) {
        const resolved = resolveLocalImportPath(current.path, imp, files);
        if (!resolved || visited.has(resolved)) continue;

        const isDirect = current.depth === 0;
        const isTypeContract = isTypeOrContractDefinition(resolved);

        if (isDirect || isTypeContract) {
          visited.add(resolved);
          if (!focusFiles.has(resolved)) {
            dependencyFiles.add(resolved);
          }
          traversalQueue.push({ path: resolved, depth: current.depth + 1 });
        }
      }
    }

    const dependencyFilesList = files.filter((f) => dependencyFiles.has(f.path));
    const transformedDependencies = await transformFilesParallel(dependencyFilesList, maxPreserveLines);
    const transformedMap = new Map();
    for (const item of transformedDependencies) {
      transformedMap.set(item.path, item);
    }

    for (const file of files) {
      const ext = path.extname(file.path).toLowerCase();
      const lang = ext ? ext.replace(/^\./, '') : '';

      if (focusFiles.has(file.path)) {
        sections.push(`### File: ${file.path} [FOCUS - FULL IMPLEMENTATION]\n\`\`\`\`${lang}\n${file.content.trim()}\n\`\`\`\`\n\n`);
      } else if (dependencyFiles.has(file.path)) {
        const transformed = transformedMap.get(file.path) || transformFileContent(file.path, file.content, maxPreserveLines);
        sections.push(`### File: ${file.path} [DEPENDENCY - SKELETON]\n\`\`\`\`${lang}\n${transformed.code}\n\`\`\`\`\n\n`);
      } else {
        const summary = summarizeExports(file.content);
        sections.push(`### File: ${file.path} [OUT OF SCOPE - SUMMARY]\n\`\`\`\`${lang}\n${summary}\n\`\`\`\`\n\n`);
      }
    }
  } else {
    const transformedList = await transformFilesParallel(files, maxPreserveLines);
    for (const item of transformedList) {
      const lang = item.ext ? item.ext.replace(/^\./, '') : '';
      sections.push(`### File: ${item.path}\n\`\`\`\`${lang}\n${item.code}\n\`\`\`\`\n\n`);
    }
  }

  return sections.join('');
}

const ARTIFACT_IGNORE_REGEX = /repomix-(?:optimized|output)/i;

export async function main() {
  const { inputFile, outputFile, maxPreserveLines, focus, exactTokens } = resolveConfig();
  const startTime = performance.now();

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input artifact not found: ${inputFile}`);
  }

  const rawContent = fs.readFileSync(inputFile, 'utf-8');
  const inputBytes = Buffer.byteLength(rawContent, 'utf-8');
  const inputTokens = countTokens(rawContent, exactTokens);

  const rawFiles = extractFiles(rawContent, inputFile);
  const files = rawFiles.filter((f) => !ARTIFACT_IGNORE_REGEX.test(f.path));
  const optimizedContent = await compressRepository(files, { focus, maxPreserveLines });

  // Stream output to disk with backpressure handling to prevent memory spikes
  const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf-8' });
  await writeToStream(writeStream, optimizedContent);
  await new Promise((resolve) => writeStream.end(resolve));

  const outputRaw = fs.readFileSync(outputFile, 'utf-8');
  const outputBytes = Buffer.byteLength(outputRaw, 'utf-8');
  const outputTokens = countTokens(outputRaw, exactTokens);
  const duration = Math.round(performance.now() - startTime);

  const byteReduction = (((inputBytes - outputBytes) / inputBytes) * 100).toFixed(1);
  const tokenReduction = (((inputTokens - outputTokens) / inputTokens) * 100).toFixed(1);

  const savedTokens = Math.max(0, inputTokens - outputTokens);
  const estimatedSavings = ((savedTokens * 3.0) / 1_000_000).toFixed(4);

  const tokenModeLabel = exactTokens ? 'LLM Tokens:' : 'LLM Tokens ~:';
  const labelTokens = tokenModeLabel.padEnd(14);
  const labelSize = 'File Size:'.padEnd(14);
  const labelSavings = 'Est. Savings:'.padEnd(14);
  const labelFocus = 'Focus Filter:'.padEnd(14);
  const labelOutput = 'Output File:'.padEnd(14);

  const inTokStr = `${formatTokens(inputTokens)}`.padStart(9);
  const outTokStr = `${formatTokens(outputTokens)}`.padStart(8);
  const inByteStr = formatBytes(inputBytes).padStart(9);
  const outByteStr = formatBytes(outputBytes).padStart(8);

  console.log(`\n${styles.green('✔')}  ${styles.bold(`Optimized ${files.length} files in ${duration}ms`)}\n`);
  console.log(`  ${styles.gray(labelTokens)} ${inTokStr}  ${styles.gray('→')}  ${styles.cyan(outTokStr)}   ${styles.green(`(-${tokenReduction}%)`)}`);
  console.log(`  ${styles.gray(labelSize)} ${inByteStr}  ${styles.gray('→')}  ${styles.cyan(outByteStr)}   ${styles.green(`(-${byteReduction}%)`)}`);
  console.log(`  ${styles.gray(labelSavings)} ${styles.yellow(`~$${estimatedSavings} / prompt`)} ${styles.gray('(Claude 3.5 Sonnet / GPT-4o input rate)')}`);
  if (focus) {
    console.log(`  ${styles.gray(labelFocus)} ${styles.magenta(focus)}`);
  }
  console.log(`  ${styles.gray(labelOutput)} ${styles.bold(outputFile)}\n`);
}
