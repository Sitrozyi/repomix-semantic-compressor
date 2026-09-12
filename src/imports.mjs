import path from 'node:path';
import { parse } from '@babel/parser';
import traversePkg from '@babel/traverse';

const traverse = traversePkg.default || traversePkg;

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
