import postcss from 'postcss';

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

    const insertMatch = stmt.match(/^INSERT\s+INTO\s+([`"'\w.]+)/i);

    if (insertMatch) {
      const tableName = insertMatch[1];
      const count = (insertCountsByTable.get(tableName) || 0) + 1;
      insertCountsByTable.set(tableName, count);

      if (count <= 2) {
        keptStatements.push(`${stmt};`);
      }
    } else {
      keptStatements.push(`${stmt};`);
    }
  }

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
