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

/**
 * Strips full-line YAML comments and collapses blank runs.
 * Lines inside block scalars (| or >) are preserved verbatim, including
 * lines that begin with `#`, since they are string content rather than comments.
 */
export function optimizeYAML(yamlCode) {
  if (!yamlCode || !yamlCode.trim()) return yamlCode;

  const lines = yamlCode.split('\n');
  const kept = [];
  let blankRun = 0;
  let blockScalarIndent = null;

  for (const line of lines) {
    const content = line.replace(/\s+$/, '');
    const leading = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (blockScalarIndent !== null) {
      if (trimmed === '' || leading > blockScalarIndent) {
        kept.push(content);
        continue;
      }
      blockScalarIndent = null;
    }

    if (/:\s*[|>][+-]?\s*$/.test(line)) {
      blockScalarIndent = leading;
      kept.push(content);
      blankRun = 0;
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    if (trimmed === '') {
      blankRun++;
      if (blankRun <= 1) kept.push('');
      continue;
    }

    blankRun = 0;
    kept.push(content);
  }

  return kept.join('\n').trim() + '\n';
}

/**
 * Collapses multi-line RUN instructions in Dockerfiles while preserving
 * stage structure (FROM/COPY/CMD/ENTRYPOINT) and all non-RUN directives.
 */
export function optimizeDockerfile(dockerCode) {
  if (!dockerCode || !dockerCode.trim()) return dockerCode;

  const lines = dockerCode.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push(line.replace(/\s+$/, ''));
      i++;
      continue;
    }

    if (/^RUN\b/i.test(trimmed)) {
      const start = i;
      while (i < lines.length && /\\\s*$/.test(lines[i])) i++;
      i++;
      const total = i - start;

      if (total <= 5) {
        for (let j = start; j < i; j++) out.push(lines[j].replace(/\s+$/, ''));
      } else {
        out.push(lines[start].replace(/\s+$/, ''));
        out.push(lines[start + 1].replace(/\s+$/, ''));
        out.push(`# ...${total - 3} lines omitted from RUN...`);
        out.push(lines[i - 1].replace(/\s+$/, ''));
      }
      continue;
    }

    out.push(line.replace(/\s+$/, ''));
    i++;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Truncates fenced code blocks longer than 32 lines in Markdown.
 * Headings, prose, tables and short code examples are preserved verbatim.
 */
export function optimizeMarkdown(mdCode) {
  if (!mdCode || !mdCode.trim()) return mdCode;

  const lines = mdCode.split('\n');
  const out = [];
  let fenceChar = null;
  let fenceLen = 0;
  let codeBuffer = [];

  const flush = (closed) => {
    if (codeBuffer.length > 32) {
      out.push(codeBuffer[0]);
      out.push(`// ...${codeBuffer.length - (closed ? 2 : 1)} lines omitted...`);
      if (closed) out.push(codeBuffer[codeBuffer.length - 1]);
    } else {
      out.push(...codeBuffer);
    }
    codeBuffer = [];
  };

  for (const line of lines) {
    if (fenceChar === null) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) {
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        codeBuffer.push(line.replace(/\s+$/, ''));
      } else {
        out.push(line.replace(/\s+$/, ''));
      }
      continue;
    }

    codeBuffer.push(line.replace(/\s+$/, ''));
    const close = line.match(/^\s{0,3}([`~]{3,})\s*$/);
    if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
      flush(true);
      fenceChar = null;
      fenceLen = 0;
    }
  }

  if (fenceChar !== null) flush(false);

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const PY_CORE_LOGIC_REGEX = /^(_+)?(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)(_|[A-Z0-9])/i;

/**
 * Skeletonizes Python code: preserves functions <= maxPreserveLines or matching core logic whitelist,
 * retains function docstrings, and replaces truncated function bodies with raise NotImplementedError.
 */
export function skeletonizePython(code, maxPreserveLines = 8) {
  if (!code || !code.trim()) return code;

  const lines = code.split('\n');
  const resultLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect function definition: def func(...) or async def func(...)
    const defMatch = line.match(/^([ \t]*)(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
    if (!defMatch) {
      resultLines.push(line);
      i++;
      continue;
    }

    const indent = defMatch[1];
    const funcName = defMatch[2];
    const defStartLine = i;

    // Collect full signature until line ending with ':' with balanced parentheses
    const sigLines = [line];
    let parenDepth = 0;
    for (const char of line.slice(line.indexOf('('))) {
      if (char === '(' || char === '[' || char === '{') parenDepth++;
      else if (char === ')' || char === ']' || char === '}') parenDepth--;
    }

    let sigEndLine = i;
    while (parenDepth > 0 && sigEndLine + 1 < lines.length) {
      sigEndLine++;
      const nextSigLine = lines[sigEndLine];
      sigLines.push(nextSigLine);
      for (const char of nextSigLine) {
        if (char === '(' || char === '[' || char === '{') parenDepth++;
        else if (char === ')' || char === ']' || char === '}') parenDepth--;
      }
    }

    // Verify that signature ends with ':' (ignoring comments)
    const lastSigLine = lines[sigEndLine];
    const strippedLast = lastSigLine.replace(/#.*$/, '').trim();
    if (!strippedLast.endsWith(':')) {
      resultLines.push(line);
      i++;
      continue;
    }

    // Identify body lines (lines following signature with deeper indentation)
    const bodyStart = sigEndLine + 1;
    let bodyEnd = bodyStart - 1;

    while (bodyEnd + 1 < lines.length) {
      const nextLine = lines[bodyEnd + 1];
      const nextTrimmed = nextLine.trim();

      if (nextTrimmed === '') {
        bodyEnd++;
        continue;
      }

      const nextIndent = nextLine.match(/^[ \t]*/)[0];
      if (nextIndent.length > indent.length && nextLine.startsWith(indent)) {
        bodyEnd++;
      } else {
        break;
      }
    }

    // Strip trailing empty lines from body
    while (bodyEnd >= bodyStart && lines[bodyEnd].trim() === '') {
      bodyEnd--;
    }

    const bodyLines = bodyEnd >= bodyStart ? lines.slice(bodyStart, bodyEnd + 1) : [];
    const totalBodyLines = bodyLines.length;

    // Preserve short or whitelisted functions
    if (
      totalBodyLines <= maxPreserveLines ||
      (funcName && PY_CORE_LOGIC_REGEX.test(funcName))
    ) {
      for (let k = defStartLine; k <= bodyEnd; k++) {
        resultLines.push(lines[k]);
      }
      i = bodyEnd + 1;
      continue;
    }

    // Output signature
    for (const sigLine of sigLines) {
      resultLines.push(sigLine);
    }

    // Determine body indentation
    let bodyIndent = indent + '    ';
    if (bodyLines.length > 0) {
      const firstNonEmpty = bodyLines.find((l) => l.trim() !== '');
      if (firstNonEmpty) {
        bodyIndent = firstNonEmpty.match(/^[ \t]*/)[0];
      }
    }

    // Preserve docstring if present as first statement
    const docstringLines = [];
    if (bodyLines.length > 0) {
      const firstLine = bodyLines[0].trim();
      const docMatch = firstLine.match(/^(?:r|u|f)?("""|''')/i);
      if (docMatch) {
        const quote = docMatch[1];
        if (firstLine.length > quote.length && firstLine.slice(quote.length).includes(quote)) {
          docstringLines.push(bodyLines[0]);
        } else {
          docstringLines.push(bodyLines[0]);
          for (let d = 1; d < bodyLines.length; d++) {
            docstringLines.push(bodyLines[d]);
            if (bodyLines[d].includes(quote)) {
              break;
            }
          }
        }
      }
    }

    for (const dLine of docstringLines) {
      resultLines.push(dLine);
    }

    resultLines.push(
      `${bodyIndent}raise NotImplementedError("Implementation omitted by repomix-semantic-compressor")`
    );

    i = bodyEnd + 1;
  }

  return resultLines.join('\n');
}

const GO_CORE_LOGIC_REGEX = /^(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/i;

/**
 * Skeletonizes Go code: preserves functions <= maxPreserveLines or matching core logic whitelist,
 * and replaces truncated function bodies with panic("Implementation omitted by repomix-semantic-compressor").
 */
export function skeletonizeGo(code, maxPreserveLines = 8) {
  if (!code || !code.trim()) return code;

  const replacements = [];
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let inRawString = false;
  let inRune = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (inRawString) {
      if (char === '`') inRawString = false;
      continue;
    }
    if (inRune) {
      if (char === '\\') {
        i++;
      } else if (char === "'") {
        inRune = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '`') {
      inRawString = true;
      continue;
    }
    if (char === "'") {
      inRune = true;
      continue;
    }

    const isFuncStart =
      (i === 0 || /[\s;}]/.test(code[i - 1])) &&
      code.startsWith('func', i) &&
      (code.length === i + 4 || /[\s(]/.test(code[i + 4]));

    if (!isFuncStart) continue;

    const funcStart = i;
    let scanIdx = i + 4;
    let parenDepth = 0;
    let bodyOpenIdx = -1;

    while (scanIdx < code.length) {
      const c = code[scanIdx];
      const nc = code[scanIdx + 1];

      if (c === '/' && nc === '/') {
        scanIdx += 2;
        while (scanIdx < code.length && code[scanIdx] !== '\n') scanIdx++;
        continue;
      }
      if (c === '/' && nc === '*') {
        scanIdx += 2;
        while (scanIdx < code.length && !(code[scanIdx] === '*' && code[scanIdx + 1] === '/')) scanIdx++;
        scanIdx += 2;
        continue;
      }
      if (c === '"') {
        scanIdx++;
        while (scanIdx < code.length && code[scanIdx] !== '"') {
          if (code[scanIdx] === '\\') scanIdx++;
          scanIdx++;
        }
        scanIdx++;
        continue;
      }
      if (c === '`') {
        scanIdx++;
        while (scanIdx < code.length && code[scanIdx] !== '`') scanIdx++;
        scanIdx++;
        continue;
      }

      if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;

      if (parenDepth === 0 && (c === ';' || c === '\n')) {
        break;
      }

      if (c === '{' && parenDepth === 0) {
        bodyOpenIdx = scanIdx;
        break;
      }

      scanIdx++;
    }

    if (bodyOpenIdx === -1) continue;

    const sig = code.slice(funcStart, bodyOpenIdx);
    const nameMatch = sig.match(/func\s*(?:\([^)]*\)\s*)?([a-zA-Z0-9_]+)/);
    const funcName = nameMatch ? nameMatch[1] : '';

    let braceDepth = 1;
    let bodyCloseIdx = -1;
    let j = bodyOpenIdx + 1;

    while (j < code.length) {
      const c = code[j];
      const nc = code[j + 1];

      if (c === '/' && nc === '/') {
        j += 2;
        while (j < code.length && code[j] !== '\n') j++;
        continue;
      }
      if (c === '/' && nc === '*') {
        j += 2;
        while (j < code.length && !(code[j] === '*' && code[j + 1] === '/')) j++;
        j += 2;
        continue;
      }
      if (c === '"') {
        j++;
        while (j < code.length && code[j] !== '"') {
          if (code[j] === '\\') j++;
          j++;
        }
        j++;
        continue;
      }
      if (c === '`') {
        j++;
        while (j < code.length && code[j] !== '`') j++;
        j++;
        continue;
      }
      if (c === "'") {
        j++;
        while (j < code.length && code[j] !== "'") {
          if (code[j] === '\\') j++;
          j++;
        }
        j++;
        continue;
      }

      if (c === '{') braceDepth++;
      else if (c === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          bodyCloseIdx = j;
          break;
        }
      }
      j++;
    }

    if (bodyCloseIdx === -1) continue;

    const bodyContent = code.slice(bodyOpenIdx + 1, bodyCloseIdx);
    const lineCount = bodyContent.split('\n').length;

    if (
      lineCount > maxPreserveLines &&
      (!funcName || !GO_CORE_LOGIC_REGEX.test(funcName))
    ) {
      const lineStart = code.lastIndexOf('\n', funcStart);
      const indent = code.slice(lineStart + 1, funcStart).match(/^[ \t]*/)[0];
      const tabOrSpace = indent.includes('\t') || indent === '' ? '\t' : '  ';

      replacements.push({
        start: bodyOpenIdx,
        end: bodyCloseIdx + 1,
        text: `{\n${indent}${tabOrSpace}panic("Implementation omitted by repomix-semantic-compressor")\n${indent}}`
      });

      i = bodyCloseIdx;
    }
  }

  replacements.sort((a, b) => b.start - a.start);
  let optimized = code;
  for (const r of replacements) {
    optimized = optimized.slice(0, r.start) + r.text + optimized.slice(r.end);
  }

  return optimized;
}
