import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import generatePkg from '@babel/generator';
import { XMLParser } from 'fast-xml-parser';

const traverse = traversePkg.default || traversePkg;
const generate = generatePkg.default || generatePkg;

// --- CLI Configuration Specifications ---
const CLI_OPTIONS = {
  input: { type: 'string', short: 'i' },
  output: { type: 'string', short: 'o', default: 'repomix-optimized.md' },
  'max-preserve-lines': { type: 'string', short: 'm', default: '8' },
  help: { type: 'boolean', short: 'h' }
};

// --- Terminal Formatting Utilities ---
const styles = {
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
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
 * Formats estimated LLM token count with thousands separator.
 * @param {number} tokens
 * @returns {string} Formatted token count
 */
function formatTokens(tokens) {
  return `~${(tokens || 0).toLocaleString()}`;
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
  -m, --max-preserve-lines <num>   Max lines to preserve full function body (default: 8)
  -h, --help                       Show CLI help and exit

${bold}Examples:${reset}
  ${dim}$${reset} npx repomix-compress
  ${dim}$${reset} npx repomix-compress -i repomix-output.xml -o context.md
  ${dim}$${reset} npx repomix-compress -m 12
`);
    process.exit(0);
  }

  let inputFile = parsed.input;
  if (!inputFile) {
    if (fs.existsSync('repomix-output.xml')) {
      inputFile = 'repomix-output.xml';
    } else if (fs.existsSync('repomix-output.json')) {
      inputFile = 'repomix-output.json';
    } else {
      console.log('repomix-output not found. Running "npx repomix" automatically...');
      try {
        execSync('npx repomix', { stdio: 'ignore' });
        if (fs.existsSync('repomix-output.xml')) {
          inputFile = 'repomix-output.xml';
        } else if (fs.existsSync('repomix-output.json')) {
          inputFile = 'repomix-output.json';
        } else {
          inputFile = 'repomix-output.xml';
        }
      } catch (err) {
        console.warn(`warning: auto-running 'npx repomix' failed: ${err.message}`);
        inputFile = 'repomix-output.xml';
      }
    }
  }

  const maxPreserveLines = Number.parseInt(parsed['max-preserve-lines'], 10);
  if (Number.isNaN(maxPreserveLines) || maxPreserveLines < 0) {
    console.error(`error: --max-preserve-lines must be a non-negative integer.`);
    process.exit(1);
  }

  return { inputFile, outputFile: parsed.output, maxPreserveLines };
}

function getPayloadPropName(memPath) {
  const obj = memPath.node.object;
  const prop = memPath.node.property;

  if (prop.type !== 'Identifier') return null;
  if (['type', 'action', 'role'].includes(prop.name)) return null;

  // Handles payload.userId
  if (obj.type === 'Identifier' && ['payload', 'data', 'event'].includes(obj.name)) {
    return prop.name;
  }

  // Handles action.payload.userId
  if (
    obj.type === 'MemberExpression' &&
    obj.property.type === 'Identifier' &&
    ['payload', 'data'].includes(obj.property.name)
  ) {
    return prop.name;
  }

  return null;
}

export function extractProtocolsFromAST(astPath) {
  const protocols = new Set();

  astPath.traverse({
    SwitchCase(casePath) {
      if (casePath.node.test && casePath.node.test.type === 'StringLiteral') {
        const actionName = casePath.node.test.value;
        const payloadProps = new Set();

        casePath.traverse({
                  MemberExpression(memPath) {
                    const propName = getPayloadPropName(memPath);
                    if (propName) payloadProps.add(propName);
                  },
                  VariableDeclarator(varPath) {
                    const init = varPath.node.init;
                    if (!init) return;

                    const isPayloadSource =
                      (init.type === 'Identifier' && ['payload', 'data', 'event'].includes(init.name)) ||
                      (init.type === 'MemberExpression' &&
                        init.property.type === 'Identifier' &&
                        ['payload', 'data'].includes(init.property.name));

                    if (isPayloadSource && varPath.node.id.type === 'ObjectPattern') {
                      for (const prop of varPath.node.id.properties) {
                        if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                          payloadProps.add(prop.key.name);
                        } else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
                          payloadProps.add(`...${prop.argument.name}`);
                        }
                      }
                    }
                  }
                });

        if (payloadProps.size > 0) {
          protocols.add(`${actionName}(${Array.from(payloadProps).join(', ')})`);
        } else {
          protocols.add(actionName);
        }
      }
    },
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      let funcName = null;

      // Standalone functions: dispatch(...)
      if (callee.type === 'Identifier') {
        funcName = callee.name;
      }
      // Method calls: emitter.emit(...) / store.dispatch(...)
      else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        funcName = callee.property.name;
      }

      if (funcName && ['emit', 'dispatch', 'trigger', 'send'].includes(funcName)) {
        const firstArg = callPath.node.arguments[0];
        if (!firstArg) return;

        // Pattern: emitter.emit('EVENT_NAME')
        if (firstArg.type === 'StringLiteral') {
          protocols.add(`emit:${firstArg.value}`);
        }
        // Pattern: dispatch({ type: 'ACTION_TYPE' })
        else if (firstArg.type === 'ObjectExpression') {
          const typeProp = firstArg.properties.find(
            (p) =>
              p.type === 'ObjectProperty' &&
              ((p.key.type === 'Identifier' && p.key.name === 'type') ||
                (p.key.type === 'StringLiteral' && p.key.value === 'type')) &&
              p.value.type === 'StringLiteral'
          );
          if (typeProp) {
            protocols.add(`dispatch:${typeProp.value.value}`);
          }
        }
      }
    },
    BinaryExpression(binPath) {
      if (['===', '=='].includes(binPath.node.operator)) {
        let stringVal = null;
        if (binPath.node.right.type === 'StringLiteral') stringVal = binPath.node.right.value;
        if (binPath.node.left.type === 'StringLiteral') stringVal = binPath.node.left.value;

        if (stringVal && /^[A-Z0-9_-]{3,}$/.test(stringVal)) {
          protocols.add(stringVal);
        }
      }
    }
  });

  return Array.from(protocols);
}

const CORE_LOGIC_REGEX = /^(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/;

function isHookCall(callNode) {
  if (!callNode || callNode.type !== 'CallExpression') return false;
  const callee = callNode.callee;
  if (callee.type === 'Identifier') {
    return /^use[A-Z0-9_]/.test(callee.name);
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return /^use[A-Z0-9_]/.test(callee.property.name);
  }
  return false;
}

function isHookStatement(stmt) {
  if (!stmt) return false;
  if (stmt.type === 'ExpressionStatement' && isHookCall(stmt.expression)) {
    return true;
  }
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations.some((decl) => decl.init && isHookCall(decl.init));
  }
  return false;
}

function simplifyHookStatement(stmt) {
  if (stmt.type === 'ExpressionStatement' && isHookCall(stmt.expression)) {
    const call = stmt.expression;
    const calleeName = call.callee.type === 'Identifier' ? call.callee.name : call.callee.property?.name || '';
    if (['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo'].includes(calleeName)) {
      if (call.arguments.length > 0) {
        const firstArg = call.arguments[0];
        if (['ArrowFunctionExpression', 'FunctionExpression'].includes(firstArg.type)) {
          firstArg.body = {
            type: 'BlockStatement',
            body: []
          };
        }
      }
    }
  }
  return stmt;
}

function getFunctionName(astPath) {
  const node = astPath.node;
  if (node.id && node.id.name) return node.id.name;
  if (astPath.parentPath) {
    if (astPath.parentPath.isVariableDeclarator() && astPath.parentPath.node.id.type === 'Identifier') {
      return astPath.parentPath.node.id.name;
    }
    if (astPath.parentPath.isObjectProperty() || astPath.parentPath.isClassProperty()) {
      if (astPath.parentPath.node.key && astPath.parentPath.node.key.type === 'Identifier') {
        return astPath.parentPath.node.key.name;
      }
    }
  }
  if (node.key && node.key.type === 'Identifier') {
    return node.key.name;
  }
  return null;
}

export function skeletonizeWithAST(code, isTypeScript, maxPreserveLines = 8, isJSX = true) {
  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        isJSX ? 'jsx' : null,
        isTypeScript ? 'typescript' : null,
        ['decorators', { decoratorsBeforeExport: true }],
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'exportDefaultFrom',
        'importAttributes'
      ].filter(Boolean)
    });

    traverse(ast, {
      JSXElement(jsxPath) {
        const children = jsxPath.node.children;
        if (!children || children.length < 3) return;

        const newChildren = [];
        let lastTagName = null;
        let repeatCount = 0;

        for (const child of children) {
          if (child.type === 'JSXElement' && child.openingElement.name.type === 'JSXIdentifier') {
            const tagName = child.openingElement.name.name;
            if (tagName === lastTagName) {
              repeatCount++;
              continue;
            } else {
              if (repeatCount > 0) {
                newChildren.push({
                  type: 'JSXExpressionContainer',
                  expression: {
                    type: 'JSXEmptyExpression',
                    innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
                  }
                });
              }
              lastTagName = tagName;
              repeatCount = 0;
              newChildren.push(child);
            }
          } else {
            if (repeatCount > 0) {
              newChildren.push({
                type: 'JSXExpressionContainer',
                expression: {
                  type: 'JSXEmptyExpression',
                  innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
                }
              });
              lastTagName = null;
              repeatCount = 0;
            }
            newChildren.push(child);
          }
        }

        if (repeatCount > 0) {
          newChildren.push({
            type: 'JSXExpressionContainer',
            expression: {
              type: 'JSXEmptyExpression',
              innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
            }
          });
        }

        jsxPath.node.children = newChildren;
      }
    });

    traverse(ast, {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod'(astPath) {
        const node = astPath.node;
        if (!node.body) return;

        const startLine = node.loc ? node.loc.start.line : 0;
        const endLine = node.loc ? node.loc.end.line : 0;
        const totalLines = endLine - startLine + 1;

        // Preserve short functions within configured threshold
        if (node.loc && totalLines <= maxPreserveLines) {
          return;
        }

        const funcName = getFunctionName(astPath);
        if (funcName && CORE_LOGIC_REGEX.test(funcName)) {
          return;
        }
        const protocols = extractProtocolsFromAST(astPath);
                let commentText = ` ...impl (${totalLines} lines)... `;
                if (protocols.length > 0) {
                  commentText = ` @payloads: ${protocols.join(' | ')} (truncated ${totalLines} lines) `;
                }

                const leading = node.leadingComments;

                // Extract top-level React Hooks (useState, useEffect deps, useRef, custom hooks)
                const hookStatements = [];
                if (node.body && node.body.type === 'BlockStatement' && Array.isArray(node.body.body)) {
                  for (const stmt of node.body.body) {
                    if (isHookStatement(stmt)) {
                      hookStatements.push(simplifyHookStatement(stmt));
                    }
                  }
                }

                let replacementBody;
                if (hookStatements.length > 0) {
                  const lastHook = hookStatements[hookStatements.length - 1];
                  lastHook.trailingComments = lastHook.trailingComments || [];
                  lastHook.trailingComments.push({ type: 'CommentBlock', value: commentText });

                  replacementBody = {
                    type: 'BlockStatement',
                    body: hookStatements
                  };
                } else {
                  replacementBody = {
                    type: 'BlockStatement',
                    body: [],
                    innerComments: [{ type: 'CommentBlock', value: commentText }]
                  };
                }

                if (astPath.isArrowFunctionExpression() && node.body.type !== 'BlockStatement') {
                  node.body = replacementBody;
                } else if (node.body && node.body.type === 'BlockStatement') {
                  node.body = replacementBody;
                }

        if (leading) {
          node.leadingComments = leading;
        }
      }
    });

    return generate(ast, {
      retainLines: false,
      compact: false,
      comments: true
    }).code;
  } catch {
    return code;
  }
}

export function optimizeHTML(html) {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, (svg) => {
      if (svg.length > 150) {
        const matchId = svg.match(/id="([^"]+)"/);
        const idAttr = matchId ? ` id="${matchId[1]}"` : '';
        return `<svg${idAttr}><!-- [SVG Icon Path Omitted] --></svg>`;
      }
      return svg;
    })
    .replace(/data:(image|font)\/[^;]+;base64,[a-zA-Z0-9+/=]+/g, 'data:$1/...[base64 omitted]...')
    .replace(/[ \t]{2,}/g, ' ');
}

export function summarizeCSS(cssCode) {
  const cleanCSS = cssCode.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!cleanCSS) return '/* Empty stylesheet */';

  const rootVariables = [];
  const layoutRules = [];
  const decorativeClasses = new Set();

  const layoutProps = new Set([
    'display',
    'position',
    'top',
    'bottom',
    'left',
    'right',
    'grid-template-columns',
    'grid-template-rows',
    'grid-template-areas',
    'flex-direction',
    'flex-wrap',
    'align-items',
    'justify-content',
    'gap',
    'z-index',
    'overflow',
    'visibility'
  ]);

  const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
  let match;

  while ((match = ruleRegex.exec(cleanCSS)) !== null) {
    const rawSelector = match[1].trim();
    const body = match[2].trim();

    if (!rawSelector || !body) continue;

    if (rawSelector === ':root' || rawSelector.includes('--')) {
      const vars = body
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('--'));
      if (vars.length > 0) {
        rootVariables.push(`${rawSelector} {\n  ${vars.join(';\n  ')};\n}`);
      }
      continue;
    }

    const declarations = body
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    const keptDecls = [];
    for (const decl of declarations) {
      const colonIndex = decl.indexOf(':');
      if (colonIndex === -1) continue;
      const prop = decl.slice(0, colonIndex).trim().toLowerCase();
      const val = decl.slice(colonIndex + 1).trim();

      if (layoutProps.has(prop) || prop.startsWith('--')) {
        keptDecls.push(`${prop}: ${val}`);
      }
    }

    if (keptDecls.length > 0) {
      layoutRules.push(`${rawSelector} { ${keptDecls.join('; ')} }`);
    } else {
      const classMatches = rawSelector.match(/\.[a-zA-Z0-9_-]+/g);
      if (classMatches) {
        for (const cls of classMatches) decorativeClasses.add(cls);
      }
    }
  }

  const sections = [];

  if (rootVariables.length > 0) {
    sections.push(`/* Design Tokens & CSS Variables */\n${rootVariables.join('\n\n')}`);
  }

  if (layoutRules.length > 0) {
    sections.push(`/* Layout & Structural Rules */\n${layoutRules.join('\n')}`);
  }

  if (decorativeClasses.size > 0) {
    sections.push(`/* Decorative/Component Classes (${decorativeClasses.size} classes) */\n` + Array.from(decorativeClasses).join(', '));
  }

  return sections.length > 0 ? sections.join('\n\n') : '/* No distinct layout or token definitions found */';
}

export function processJSON(jsonStr) {
  try {
    const cleaned = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    return JSON.stringify(JSON.parse(cleaned));
  } catch {
    return jsonStr;
  }
}

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

    const wrappedXml = `<root>${rawContent}</root>`;
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

export function writeToStream(stream, chunk) {
  if (!stream.write(chunk)) {
    return new Promise((resolve) => stream.once('drain', resolve));
  }
  return Promise.resolve();
}

export function transformFileContent(filePath, originalCode, maxPreserveLines) {
  const ext = path.extname(filePath).toLowerCase();
  // Normalize Windows CRLF to standard LF
  const normalizedCode = originalCode.replace(/\r\n/g, '\n');
  let processedCode = '';

  if (['.css', '.scss', '.less'].includes(ext)) {
    processedCode = summarizeCSS(normalizedCode);
  } else if (ext === '.html' || ext === '.htm') {
    processedCode = optimizeHTML(normalizedCode);
  } else if (ext === '.json') {
    processedCode = processJSON(normalizedCode);
  } else if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx'].includes(ext)) {
    const isTS = ['.ts', '.mts', '.cts', '.tsx'].includes(ext);
    const isJSX = ['.jsx', '.tsx', '.js'].includes(ext);
    processedCode = skeletonizeWithAST(normalizedCode, isTS, maxPreserveLines, isJSX);
  } else {
    processedCode = normalizedCode;
  }

  return {
    ext,
    code: processedCode.replace(/(?:\r?\n){3,}/g, '\n\n').trim()
  };
}

export async function main() {
  const startTime = performance.now();
  const { inputFile, outputFile, maxPreserveLines } = resolveConfig();

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input artifact not found: ${inputFile}`);
  }

  const rawContent = fs.readFileSync(inputFile, 'utf-8');
  const inputBytes = Buffer.byteLength(rawContent, 'utf-8');
  const inputTokens = Math.round(inputBytes / 3.8); // Standard empirical token heuristic

  const files = extractFiles(rawContent, inputFile);
  const outStream = fs.createWriteStream(outputFile, { encoding: 'utf-8' });

  // Stream semantic skeleton header
  await writeToStream(
    outStream,
    `[SEMANTIC REPOSITORY SKELETON CONTEXT]\n  Optimized for LLM reasoning & architectural analysis.\n========================================\n\n`
  );
  // Transform and stream individual file skeletons
    for (const file of files) {
      const transformed = transformFileContent(file.path, file.content, maxPreserveLines);
      const lang = transformed.ext ? transformed.ext.replace(/^\./, '') : '';
      // Use 4-backtick code fences to prevent nested markdown/backtick collisions
      await writeToStream(outStream, `### File: ${file.path}\n\`\`\`\`${lang}\n${transformed.code}\n\`\`\`\`\n\n`);
    }

  await new Promise((resolve) => outStream.end(resolve));

  // Compute final compression metrics
  const outputBytes = fs.statSync(outputFile).size;
  const outputTokens = Math.round(outputBytes / 3.8);
  const duration = Math.round(performance.now() - startTime);

  const byteReduction = (((inputBytes - outputBytes) / inputBytes) * 100).toFixed(1);
  const tokenReduction = (((inputTokens - outputTokens) / inputTokens) * 100).toFixed(1);

  // Render high-signal execution summary to stdout
    const labelTokens = 'LLM Tokens:'.padEnd(12);
    const labelSize   = 'File Size:'.padEnd(12);
    const labelOutput = 'Output:'.padEnd(12);

    const inTokStr  = formatTokens(inputTokens).padEnd(10);
    const outTokStr = formatTokens(outputTokens).padEnd(10);
    const inByteStr = formatBytes(inputBytes).padEnd(10);
    const outByteStr= formatBytes(outputBytes).padEnd(10);

    console.log(`\n${styles.green('✔')}  ${styles.bold(`Optimized ${files.length} files in ${duration}ms`)}\n`);
    console.log(`  ${styles.gray(labelTokens)} ${inTokStr} ${styles.gray('→')}   ${styles.cyan(outTokStr)}  ${styles.green(`(-${tokenReduction}%)`)}`);
    console.log(`  ${styles.gray(labelSize)} ${inByteStr} ${styles.gray('→')}   ${styles.cyan(outByteStr)}  ${styles.green(`(-${byteReduction}%)`)}`);
    console.log(`  ${styles.gray(labelOutput)} ${styles.bold(outputFile)}\n`);
}
