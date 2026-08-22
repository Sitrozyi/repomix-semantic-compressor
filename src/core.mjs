import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import generatePkg from '@babel/generator';
import { XMLParser } from 'fast-xml-parser';
import postcss from 'postcss';
import { getEncoding } from 'js-tiktoken';

const traverse = traversePkg.default || traversePkg;
const generate = generatePkg.default || generatePkg;

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

function getPayloadPropName(memPath) {
  const node = memPath.node;
  if (!node) return null;
  const obj = node.object;
  const prop = node.property;

  if (!prop || prop.type !== 'Identifier') return null;
  if (['type', 'action', 'role'].includes(prop.name)) return null;

  // Handles payload.userId and payload?.userId
  if (obj && obj.type === 'Identifier' && ['payload', 'data', 'event'].includes(obj.name)) {
    return prop.name;
  }

  // Handles action.payload.userId and action?.payload?.userId
  if (
    obj &&
    (obj.type === 'MemberExpression' || obj.type === 'OptionalMemberExpression') &&
    obj.property &&
    obj.property.type === 'Identifier' &&
    ['payload', 'data'].includes(obj.property.name)
  ) {
    return prop.name;
  }

  return null;
}

function collectDestructuredProps(pattern, targetSet) {
  if (!pattern) return;
  if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'ObjectProperty') {
        if (prop.value.type === 'Identifier') {
          targetSet.add(prop.value.name);
        } else if (prop.value.type === 'ObjectPattern' || prop.value.type === 'ArrayPattern') {
          collectDestructuredProps(prop.value, targetSet);
        } else if (prop.value.type === 'AssignmentPattern') {
          if (prop.value.left.type === 'Identifier') {
            targetSet.add(prop.value.left.name);
          } else {
            collectDestructuredProps(prop.value.left, targetSet);
          }
        } else if (prop.key && prop.key.type === 'Identifier') {
          targetSet.add(prop.key.name);
        }
      } else if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
        targetSet.add(`...${prop.argument.name}`);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of pattern.elements) {
      if (!elem) continue;
      if (elem.type === 'Identifier') {
        targetSet.add(elem.name);
      } else if (elem.type === 'ObjectPattern' || elem.type === 'ArrayPattern') {
        collectDestructuredProps(elem, targetSet);
      } else if (elem.type === 'RestElement' && elem.argument && elem.argument.type === 'Identifier') {
        targetSet.add(`...${elem.argument.name}`);
      }
    }
  }
}

export function extractProtocolsFromAST(astPath) {
  const protocols = new Set();

  astPath.traverse({
    SwitchCase(casePath) {
      if (casePath.node.test && casePath.node.test.type === 'StringLiteral') {
        const actionName = casePath.node.test.value;
        const payloadProps = new Set();

        casePath.traverse({
          'MemberExpression|OptionalMemberExpression'(memPath) {
            const propName = getPayloadPropName(memPath);
            if (propName) payloadProps.add(propName);
          },
          VariableDeclarator(varPath) {
            const init = varPath.node.init;
            if (!init) return;

            const isPayloadSource =
              (init.type === 'Identifier' && ['payload', 'data', 'event'].includes(init.name)) ||
              ((init.type === 'MemberExpression' || init.type === 'OptionalMemberExpression') &&
                init.property &&
                init.property.type === 'Identifier' &&
                ['payload', 'data'].includes(init.property.name));

            if (isPayloadSource && varPath.node.id) {
              collectDestructuredProps(varPath.node.id, payloadProps);
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

const CORE_LOGIC_REGEX = /^#?(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/;

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

function isHookCallback(astPath) {
  if (!astPath.parentPath) return false;
  const parent = astPath.parentPath.node;
  if (parent.type === 'CallExpression' && isHookCall(parent)) {
    return true;
  }
  return false;
}

function simplifyHookCall(call) {
  if (!call || call.type !== 'CallExpression') return call;
  const calleeName = call.callee.type === 'Identifier' ? call.callee.name : call.callee.property?.name || '';
  if (['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo'].includes(calleeName)) {
    if (call.arguments.length > 0) {
      const firstArg = call.arguments[0];
      if (['ArrowFunctionExpression', 'FunctionExpression'].includes(firstArg.type)) {
        firstArg.body = {
          type: 'BlockStatement',
          body: []
        };
        firstArg.expression = false;
        delete firstArg.leadingComments;
        delete firstArg.innerComments;
        delete firstArg.trailingComments;
      }
    }
  }
  return call;
}

function simplifyHookStatement(stmt) {
  if (!stmt) return stmt;
  if (stmt.type === 'ExpressionStatement' && isHookCall(stmt.expression)) {
    simplifyHookCall(stmt.expression);
  } else if (stmt.type === 'VariableDeclaration') {
    for (const decl of stmt.declarations) {
      if (decl.init && isHookCall(decl.init)) {
        simplifyHookCall(decl.init);
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
      if (astPath.parentPath.node.key) {
        if (astPath.parentPath.node.key.type === 'Identifier') return astPath.parentPath.node.key.name;
        if (astPath.parentPath.node.key.type === 'PrivateName' && astPath.parentPath.node.key.id) {
          return `#${astPath.parentPath.node.key.id.name}`;
        }
      }
    }
  }
  if (node.key) {
    if (node.key.type === 'Identifier') return node.key.name;
    if (node.key.type === 'PrivateName' && node.key.id) return `#${node.key.id.name}`;
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
        'decoratorAutoAccessors',
        'explicitResourceManagement',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'classStaticBlock',
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
        let pendingWhitespace = [];

        for (const child of children) {
          if (child.type === 'JSXText' && child.value.trim() === '') {
            if (repeatCount > 0) {
              continue;
            }
            pendingWhitespace.push(child);
            continue;
          }

          if (child.type === 'JSXElement' && child.openingElement.name.type === 'JSXIdentifier') {
            const tagName = child.openingElement.name.name;
            if (tagName === lastTagName) {
              repeatCount++;
              pendingWhitespace = [];
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
              if (pendingWhitespace.length > 0) {
                newChildren.push(...pendingWhitespace);
                pendingWhitespace = [];
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
            if (pendingWhitespace.length > 0) {
              newChildren.push(...pendingWhitespace);
              pendingWhitespace = [];
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
        if (pendingWhitespace.length > 0) {
          newChildren.push(...pendingWhitespace);
        }

        jsxPath.node.children = newChildren;
      }
    });

    traverse(ast, {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod|StaticBlock'(astPath) {
        if (astPath.isStaticBlock()) {
          const node = astPath.node;
          const startLine = node.loc ? node.loc.start.line : 0;
          const endLine = node.loc ? node.loc.end.line : 0;
          const totalLines = endLine - startLine + 1;
          if (node.loc && totalLines <= maxPreserveLines) return;
          node.body = [];
          node.innerComments = [{ type: 'CommentBlock', value: ` ...static block impl (${totalLines} lines)... ` }];
          astPath.skip();
          return;
        }

        // Skip direct processing of hook callbacks (handled by simplifyHookCall on the parent component)
        if (isHookCallback(astPath)) {
          astPath.skip();
          return;
        }

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
        const isConstructor =
          node.kind === 'constructor' ||
          (astPath.isClassMethod() && node.key && node.key.type === 'Identifier' && node.key.name === 'constructor');
        const isSetter = node.kind === 'set';

        const protocols = extractProtocolsFromAST(astPath);
        let commentText = ` ...impl (${totalLines} lines)... `;
        if (protocols.length > 0) {
          commentText = ` @payloads: ${protocols.join(' | ')} (truncated ${totalLines} lines) `;
        }

        const leading = node.leadingComments;

        const hookStatements = [];
        let superCallStatement = null;

        if (node.body && node.body.type === 'BlockStatement' && Array.isArray(node.body.body)) {
          for (const stmt of node.body.body) {
            if (isConstructor && !superCallStatement) {
              if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'Super'
              ) {
                superCallStatement = stmt;
              }
            }
            if (isHookStatement(stmt)) {
              hookStatements.push(simplifyHookStatement(stmt));
            }
          }
        }

        let replacementBody;

        if (isConstructor) {
          const ctorBody = superCallStatement ? [superCallStatement] : [];
          replacementBody = {
            type: 'BlockStatement',
            body: ctorBody,
            innerComments: [{ type: 'CommentBlock', value: ` ...constructor impl (${totalLines} lines)... ` }]
          };
        } else if (isSetter) {
          replacementBody = {
            type: 'BlockStatement',
            body: [],
            innerComments: [{ type: 'CommentBlock', value: commentText }]
          };
        } else {
          const returnExpression = isTypeScript
            ? {
                type: 'TSAsExpression',
                expression: { type: 'NullLiteral' },
                typeAnnotation: { type: 'TSAnyKeyword' }
              }
            : { type: 'NullLiteral' };

          const dummyReturn = {
            type: 'ReturnStatement',
            argument: returnExpression,
            leadingComments: [{ type: 'CommentBlock', value: commentText }]
          };

          replacementBody = {
            type: 'BlockStatement',
            body: hookStatements.length > 0 ? [...hookStatements, dummyReturn] : [dummyReturn]
          };
        }

        if (astPath.isArrowFunctionExpression() && node.body.type !== 'BlockStatement') {
          node.body = replacementBody;
          node.expression = false;
        } else if (node.body && node.body.type === 'BlockStatement') {
          node.body = replacementBody;
        }

        if (leading) {
          node.leadingComments = leading;
        }

        astPath.skip();
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

const LAYOUT_PROPS = new Set([
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

export function summarizeCSS(cssCode) {
  if (!cssCode || !cssCode.trim()) return '/* Empty stylesheet */';

  let root;
  try {
    root = postcss.parse(cssCode, { from: undefined });
  } catch {
    return '/* Invalid CSS stylesheet */';
  }

  const rootVariables = [];
  const layoutRules = [];
  const decorativeClasses = new Set();

  function extractRule(ruleNode) {
    const keptDecls = [];
    const nestedRules = [];

    for (const child of ruleNode.nodes || []) {
      if (child.type === 'decl') {
        const prop = child.prop.toLowerCase();
        if (LAYOUT_PROPS.has(prop) || prop.startsWith('--')) {
          keptDecls.push(`${child.prop}: ${child.value}`);
        }
      } else if (child.type === 'rule') {
        const sub = extractRule(child);
        if (sub) nestedRules.push(sub);
      }
    }

    if (keptDecls.length > 0 || nestedRules.length > 0) {
      const parts = [];
      if (keptDecls.length > 0) {
        parts.push(keptDecls.join('; '));
      }
      if (nestedRules.length > 0) {
        parts.push(nestedRules.join('\n  '));
      }
      return `${ruleNode.selector} { ${parts.join('; ')} }`;
    }
    return null;
  }

  function processContainer(container) {
    if (!container || !container.nodes) return;

    for (const node of container.nodes) {
      if (node.type === 'comment') continue;

      if (node.type === 'atrule') {
        const atName = node.name.toLowerCase();
        if (['media', 'supports', 'container'].includes(atName)) {
          const subLayoutRules = [];
          for (const subNode of node.nodes || []) {
            if (subNode.type === 'rule') {
              const ruleResult = extractRule(subNode);
              if (ruleResult) subLayoutRules.push(ruleResult);
            }
          }
          if (subLayoutRules.length > 0) {
            layoutRules.push(`@${node.name} ${node.params} {\n  ${subLayoutRules.join('\n  ')}\n}`);
          }
        }
        continue;
      }

      if (node.type === 'rule') {
        const selector = node.selector ? node.selector.trim() : '';
        if (!selector) continue;

        // Isolate root-level custom properties without misinterpreting BEM class names
        const isRootScope = selector === ':root' || selector === ':host' || selector.startsWith(':root');
        if (isRootScope) {
          const varDecls = [];
          node.walkDecls((decl) => {
            if (decl.prop.startsWith('--')) {
              varDecls.push(`${decl.prop}: ${decl.value}`);
            }
          });
          if (varDecls.length > 0) {
            rootVariables.push(`${selector} {\n  ${varDecls.join(';\n  ')};\n}`);
          }
          continue;
        }

        const ruleResult = extractRule(node);
        if (ruleResult) {
          layoutRules.push(ruleResult);
        } else {
          const classMatches = selector.match(/\.[a-zA-Z0-9_-]+/g);
          if (classMatches) {
            for (const cls of classMatches) decorativeClasses.add(cls);
          }
        }
      }
    }
  }

  processContainer(root);

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
export function splitSQLStatements(sqlCode) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sqlCode.length; i++) {
    const char = sqlCode[i];
    const nextChar = sqlCode[i + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarTag !== null) {
      if (char === '$' && sqlCode.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += char;
      }
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === '\\') {
        if (nextChar) {
          current += nextChar;
          i++;
        }
      } else if (char === "'") {
        if (nextChar === "'") {
          current += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '\\') {
        if (nextChar) {
          current += nextChar;
          i++;
        }
      } else if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (inBacktick) {
      current += char;
      if (char === '`') {
        inBacktick = false;
      }
      continue;
    }

    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      current += char + nextChar;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += char + nextChar;
      i++;
      continue;
    }

    if (char === '$') {
      let tagEnd = -1;
      for (let j = i + 1; j < sqlCode.length && j <= i + 64; j++) {
        const c = sqlCode[j];
        if (c === '$') {
          tagEnd = j;
          break;
        }
        if (!(/[a-zA-Z0-9_]/).test(c)) {
          break;
        }
      }
      if (tagEnd !== -1) {
        dollarTag = sqlCode.substring(i, tagEnd + 1);
        current += dollarTag;
        i = tagEnd;
        continue;
      }
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}

export function optimizeSQL(sqlCode) {
  const statements = splitSQLStatements(sqlCode);

  const keptStatements = [];
  const insertCountsByTable = new Map();

  for (const stmt of statements) {
    const upper = stmt.toUpperCase();

    // Check if it is an INSERT statement
    const insertMatch = stmt.match(/^INSERT\s+INTO\s+([`"'\w.]+)/i);

    if (insertMatch) {
      const tableName = insertMatch[1];
      const count = (insertCountsByTable.get(tableName) || 0) + 1;
      insertCountsByTable.set(tableName, count);

      // Keep only the first 2 sample INSERTs per table
      if (count <= 2) {
        keptStatements.push(`${stmt};`);
      }
    } else {
      // Always keep DDL (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.) and other queries
      keptStatements.push(`${stmt};`);
    }
  }

  // Append summary comment for truncated INSERTs
  const omittedSummaries = [];
  for (const [table, total] of insertCountsByTable.entries()) {
    if (total > 2) {
      omittedSummaries.push(`/* ... ${total - 2} redundant INSERT statements omitted for ${table} ... */`);
    }
  }

  if (omittedSummaries.length > 0) {
    keptStatements.push(omittedSummaries.join('\n'));
  }

  return keptStatements.join('\n\n');
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
    } else if (ext === '.sql') {
      processedCode = optimizeSQL(normalizedCode);
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
 * Extracts import and require paths from source code using AST parsing with regex fallback.
 * @param {string} code
 * @returns {string[]}
 */
export function extractImports(code) {
  const importedPaths = new Set();
  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        ['decorators', { decoratorsBeforeExport: true }],
        'decoratorAutoAccessors',
        'explicitResourceManagement',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'classStaticBlock',
        'dynamicImport',
        'exportDefaultFrom',
        'importAttributes'
      ]
    });

    traverse(ast, {
      ImportDeclaration(importPath) {
        if (importPath.node.source && importPath.node.source.value) {
          importedPaths.add(importPath.node.source.value);
        }
      },
      ExportNamedDeclaration(exportPath) {
        if (exportPath.node.source && exportPath.node.source.value) {
          importedPaths.add(exportPath.node.source.value);
        }
      },
      ExportAllDeclaration(exportPath) {
        if (exportPath.node.source && exportPath.node.source.value) {
          importedPaths.add(exportPath.node.source.value);
        }
      },
      CallExpression(callPath) {
        const callee = callPath.node.callee;
        if (callee.type === 'Identifier' && callee.name === 'require') {
          const arg = callPath.node.arguments[0];
          if (arg && arg.type === 'StringLiteral') {
            importedPaths.add(arg.value);
          }
        }
        if (callee.type === 'Import') {
          const arg = callPath.node.arguments[0];
          if (arg && arg.type === 'StringLiteral') {
            importedPaths.add(arg.value);
          }
        }
      }
    });

    return Array.from(importedPaths);
  } catch {
    const importRegex = /(?:import\s+(?:[^\n\r;]+?from\s+)?['"]([^'"]+)['"]|export\s+[^\n\r;]+?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const p = match[1] || match[2] || match[3];
      if (p) importedPaths.add(p);
    }
    return Array.from(importedPaths);
  }
}

const RESOLVABLE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.d.ts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.d.ts',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
  '/index.json'
];

/**
 * Resolves relative, aliased, subpath, and monorepo workspace package imports.
 * @param {string} fromFilePath
 * @param {string} importPath
 * @param {{ path: string }[]} allFiles
 * @returns {string|null}
 */
export function resolveLocalImportPath(fromFilePath, importPath, allFiles) {
  const fileMap = new Map();
  for (const f of allFiles) {
    const normalized = path.normalize(f.path).replace(/\\/g, '/');
    fileMap.set(normalized, f.path);
    fileMap.set(normalized.toLowerCase(), f.path);
  }

  const normalizedFromFile = path.normalize(fromFilePath).replace(/\\/g, '/');
  const candidateBases = [];

  if (importPath.startsWith('.')) {
    const currentDir = path.dirname(normalizedFromFile);
    candidateBases.push(path.normalize(path.join(currentDir, importPath)).replace(/\\/g, '/'));
  } else if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
    const subPath = importPath.slice(2);
    candidateBases.push(path.normalize(subPath).replace(/\\/g, '/'));
    candidateBases.push(path.normalize(path.join('src', subPath)).replace(/\\/g, '/'));
  } else if (importPath.startsWith('#')) {
    const subPath = importPath.slice(1);
    candidateBases.push(path.normalize(subPath).replace(/\\/g, '/'));
    candidateBases.push(path.normalize(path.join('src', subPath)).replace(/\\/g, '/'));
  } else {
    candidateBases.push(path.normalize(importPath).replace(/\\/g, '/'));
    candidateBases.push(path.normalize(path.join('src', importPath)).replace(/\\/g, '/'));
    candidateBases.push(path.normalize(path.join('packages', importPath)).replace(/\\/g, '/'));
  }

  for (const base of candidateBases) {
    for (const ext of RESOLVABLE_EXTENSIONS) {
      const candidate = `${base}${ext}`;
      if (fileMap.has(candidate)) {
        return fileMap.get(candidate);
      }
      const lower = candidate.toLowerCase();
      if (fileMap.has(lower)) {
        return fileMap.get(lower);
      }
    }
  }

  return null;
}

/**
 * Summarizes top-level exports for out-of-scope non-focused files using AST analysis.
 * @param {string} code
 * @returns {string}
 */
export function summarizeExports(code) {
  const exports = new Set();
  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        ['decorators', { decoratorsBeforeExport: true }],
        'decoratorAutoAccessors',
        'explicitResourceManagement',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'classStaticBlock',
        'dynamicImport',
        'exportDefaultFrom',
        'importAttributes'
      ]
    });

    traverse(ast, {
      ExportNamedDeclaration(exportPath) {
        if (exportPath.node.declaration) {
          const decl = exportPath.node.declaration;
          if (decl.id && decl.id.name) {
            exports.add(decl.id.name);
          } else if (decl.declarations && Array.isArray(decl.declarations)) {
            for (const d of decl.declarations) {
              if (d.id && d.id.type === 'Identifier') {
                exports.add(d.id.name);
              }
            }
          }
        }
        if (exportPath.node.specifiers && Array.isArray(exportPath.node.specifiers)) {
          for (const spec of exportPath.node.specifiers) {
            if (spec.exported && spec.exported.name) {
              exports.add(spec.exported.name);
            }
          }
        }
      },
      ExportDefaultDeclaration(exportPath) {
        const decl = exportPath.node.declaration;
        if (decl.id && decl.id.name) {
          exports.add(`default (${decl.id.name})`);
        } else {
          exports.add('default');
        }
      }
    });

    if (exports.size > 0) {
      return `// Exported signatures: ${Array.from(exports).join(', ')}\n// [Non-focused implementation omitted]`;
    }
  } catch {
    const exportRegex = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([a-zA-Z0-9_$]+)/g;
    let m;
    while ((m = exportRegex.exec(code)) !== null) {
      exports.add(m[1]);
    }
    if (exports.size > 0) {
      return `// Exported signatures: ${Array.from(exports).join(', ')}\n// [Non-focused implementation omitted]`;
    }
  }

  return `// [Non-focused implementation omitted]`;
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
