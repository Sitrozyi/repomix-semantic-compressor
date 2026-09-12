import { describe, it, expect } from 'vitest';
import {
  skeletonizeWithAST,
  summarizeCSS,
  optimizeHTML,
  optimizeSQL,
  optimizeYAML,
  optimizeDockerfile,
  optimizeMarkdown,
  extractFiles,
  countTokens,
  compressRepository,
  resolveLocalImportPath,
  findDefaultInputFile
} from '../src/core.mjs';
import { sanitizeInputPath } from '../src/mcp.mjs';

describe('AST Skeletonizer', () => {
  it('preserves short utility & calculation functions (<= 8 lines)', () => {
    const code = 'function calculateDamage(base, modifier) {\n  const finalVal = base * modifier;\n  return Math.max(0, finalVal);\n}';
    const result = skeletonizeWithAST(code, false, 8);
    expect(result).toContain('const finalVal = base * modifier;');
    expect(result).toContain('return Math.max(0, finalVal);');
  });

  it('preserves core whitelist functions (is*, validate*, calc*) even if longer than threshold', () => {
    const code = 'function validateUserPermission(user, role) {\n  if (!user) return false;\n  if (user.isAdmin) return true;\n  if (user.role === role) return true;\n  return false;\n}';
    const result = skeletonizeWithAST(code, false, 2);
    expect(result).toContain('if (user.isAdmin) return true;');
  });

  it('preserves JSDoc / TSDoc comments while folding function implementations', () => {
    const code = '/**\n * Performs heavy physics simulation.\n * @param {number} delta\n */\nfunction simulatePhysics(delta) {\n  const x = delta * 10;\n  const y = delta * 20;\n  const z = x + y;\n  return z;\n}';
    const result = skeletonizeWithAST(code, false, 2);
    expect(result).toContain('Performs heavy physics simulation');
    expect(result).toMatch(/\.\.\.impl \(\d+ lines\)\.\.\./);
    expect(result).not.toContain('const x = delta * 10;');
  });

  it('extracts Action/Event protocols from switch cases, emitter.emit, and dispatch', () => {
    const code = `
function handleEvents(action, emitter) {
  emitter.emit('USER_LOGGED_IN', { id: 123 });
  dispatch({ type: 'SYNC_COMPLETE', payload: true });
  switch (action.type) {
    case 'LOGIN_USER':
      console.log(action.payload.userId, action.payload.authToken);
      break;
    case 'LOGOUT':
      sessionStorage.clear();
      break;
  }
}
`;
    const result = skeletonizeWithAST(code, false, 2);
    expect(result).toContain('LOGIN_USER(userId, authToken)');
    expect(result).toContain('emit:USER_LOGGED_IN');
    expect(result).toContain('dispatch:SYNC_COMPLETE');
  });

  it('compresses repetitive JSX list elements into mock summary', () => {
    const jsxCode = `
export const ItemList = () => {
  return (
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
      <li>Item 4</li>
    </ul>
  );
};
`;
    const result = skeletonizeWithAST(jsxCode, false, 20);
    expect(result).toContain('<li>Item 1</li>');
    expect(result).toContain('repeating <li /> omitted');
    expect(result).not.toContain('<li>Item 4</li>');
  });

  it('handles TypeScript Generics, Interfaces, and TSX without syntax errors', () => {
    const tsxCode = 'interface UserState<T> { data: T; isLoading: boolean; }\nexport const UserCard = <T extends Record<string, any>>({ user }: { user: UserState<T> }) => {\n  const handleClick = () => { console.log("clicked"); };\n  return <div onClick={handleClick}>{JSON.stringify(user)}</div>;\n};';
    const result = skeletonizeWithAST(tsxCode, true, 2, true);
    expect(result).toContain('interface UserState<T>');
    expect(result).toContain('export const UserCard =');
    expect(result).not.toContain('console.log("clicked");');
  });

  it('injects a throw stub for truncated pure JavaScript functions without TS escapes', () => {
    const jsCode = 'function processData(items) {\n  const mapped = items.map(x => x * 2);\n  console.log(mapped);\n  return mapped;\n}';
    const result = skeletonizeWithAST(jsCode, false, 2, false);
    expect(result).toContain('throw new Error');
    expect(result).not.toContain('return null');
    expect(result).not.toContain('as any');
  });

  it('correctly parses generic arrow functions in pure TypeScript (.ts without JSX) and injects a throw stub', () => {
    const tsCode = 'export const identity = <T>(val: T): T => {\n  const logged = val;\n  console.log(logged);\n  return logged;\n};';
    const result = skeletonizeWithAST(tsCode, true, 2, false);
    expect(result).toMatch(/export const identity = <T,?>\(val: T\): T =>/);
    expect(result).toContain('throw new Error');
    expect(result).not.toContain('as any');
  });

  it('extracts Action payloads from object destructuring', () => {
    const code = `
function gameReducer(state, action) {
  switch (action.type) {
    case 'CARD_PLAYED': {
      const { cardId, targetSlot, ...extra } = action.payload;
      break;
    }
  }
}
`;
    const result = skeletonizeWithAST(code, false, 2, false);
    expect(result).toContain('CARD_PLAYED(cardId, targetSlot, ...extra)');
  });

  it('preserves React Hooks (useState, useRef, useEffect deps) while truncating component body', () => {
    const reactCode = `
export const UserDashboard = ({ userId }) => {
  const [user, setUser] = useState(null);
  const countRef = useRef(0);
  useEffect(() => {
    fetchUserData(userId).then(res => setUser(res.data));
    console.log('Heavy render logic');
  }, [userId]);

  const handleUpdate = () => {
    console.log('Update button clicked');
  };

  return <div>{user ? user.name : 'Loading'}</div>;
};
`;
    const result = skeletonizeWithAST(reactCode, false, 2, true);
    expect(result).toContain('const [user, setUser] = useState(null);');
    expect(result).toContain('const countRef = useRef(0);');
    expect(result).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[userId\]\);/);
    expect(result).not.toContain('Heavy render logic');
    expect(result).not.toContain('Update button clicked');
  });

  it('emits a throw stub for truncated TypeScript functions with declared return types, avoiding as-any escapes', () => {
    const code = 'export async function fetchUser(id: string): Promise<User> {\n  const res = await fetch(`/api/${id}`);\n  const data = await res.json();\n  return data;\n}';
    const result = skeletonizeWithAST(code, true, 2, false);
    expect(result).toContain('throw new Error');
    expect(result).not.toContain('as any');
    expect(result).not.toContain('return null');
  });

  it('emits a throw stub for truncated JavaScript functions instead of a bare null return', () => {
    const code = 'function heavyCompute(input) {\n  const a = input * 2;\n  const b = a + 1;\n  const c = Math.sqrt(b);\n  return c;\n}';
    const result = skeletonizeWithAST(code, false, 2, false);
    expect(result).toContain('throw new Error');
    expect(result).not.toContain('return null');
  });
});

describe('CSS Semantic Optimizer', () => {
  it('preserves :root variables and layout properties while omitting decorative styles', () => {
    const css = ':root { --primary-theme: #3b82f6; --font-main: "Inter", sans-serif; }\n.sidebar { display: flex; flex-direction: column; position: fixed; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); padding: 16px; }\n.btn-primary { background-color: var(--primary-theme); color: white; border-radius: 8px; }';
    const result = summarizeCSS(css);
    expect(result).toContain('--primary-theme: #3b82f6;');
    expect(result).toContain('display: flex');
    expect(result).toContain('flex-direction: column');
    expect(result).toContain('position: fixed');
    expect(result).not.toContain('box-shadow');
    expect(result).toContain('.btn-primary');
  });

  it('handles nested CSS with @media and CSS nesting without syntax errors', () => {
    const nestedCSS = `
:root { --main-bg: #000; }
@media (max-width: 768px) {
  .sidebar {
    display: flex;
    & > .nav-item {
      position: absolute;
    }
  }
}
.card {
  color: red;
}
`;
    const result = summarizeCSS(nestedCSS);
    expect(result).toContain('--main-bg: #000');
    expect(result).toContain('@media (max-width: 768px)');
    expect(result).toContain('display: flex');
    expect(result).toContain('position: absolute');
    expect(result).toContain('.card');
  });
});

describe('HTML/SVG Optimizer', () => {
  it('truncates large SVG path payloads and base64 images', () => {
    const html = '<div class="icon-container">\n  <svg id="logo" viewBox="0 0 100 100">\n    <path d="M10 80 Q 52.5 10, 95 80 T 180 80 M10 80 Q 52.5 10, 95 80 T 180 80 M10 80 Q 52.5 10, 95 80 T 180 80" fill="red"/>\n  </svg>\n  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" />\n</div>';
    const result = optimizeHTML(html);
    expect(result).toContain('<svg id="logo"><!-- [SVG Icon Path Omitted] --></svg>');
    expect(result).toContain('data:image/...[base64 omitted]...');
  });
});

describe('SQL Semantic Optimizer', () => {
  it('preserves DDL schema definitions while truncating bulk INSERT seed data', () => {
    const sql = `
CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);

INSERT INTO users (id, email) VALUES (1, 'a@test.com');
INSERT INTO users (id, email) VALUES (2, 'b@test.com');
INSERT INTO users (id, email) VALUES (3, 'c@test.com');
INSERT INTO users (id, email) VALUES (4, 'd@test.com');
INSERT INTO users (id, email) VALUES (5, 'e@test.com');
`;
    const result = optimizeSQL(sql);
    expect(result).toContain('CREATE TABLE users');
    expect(result).toContain("INSERT INTO users (id, email) VALUES (1, 'a@test.com');");
    expect(result).toContain("INSERT INTO users (id, email) VALUES (2, 'b@test.com');");
    expect(result).not.toContain("INSERT INTO users (id, email) VALUES (5, 'e@test.com');");
    expect(result).toContain('/* ... 3 redundant INSERT statements omitted for users ... */');
  });

  it('handles SQL queries with semicolons inside string literals without breaking statements', () => {
    const sql = `
CREATE TABLE logs (
  id INT PRIMARY KEY,
  message TEXT
);

INSERT INTO logs (id, message) VALUES (1, 'error; retry needed; code=500');
INSERT INTO logs (id, message) VALUES (2, 'success; all good');
INSERT INTO logs (id, message) VALUES (3, 'warning; check syntax');
`;
    const result = optimizeSQL(sql);
    expect(result).toContain('CREATE TABLE logs');
    expect(result).toContain("INSERT INTO logs (id, message) VALUES (1, 'error; retry needed; code=500');");
    expect(result).toContain("INSERT INTO logs (id, message) VALUES (2, 'success; all good');");
    expect(result).not.toContain("INSERT INTO logs (id, message) VALUES (3, 'warning; check syntax');");
    expect(result).toContain('/* ... 1 redundant INSERT statements omitted for logs ... */');
  });
});

describe('Fast-XML & JSON Extractor', () => {
  it('parses XML Repomix output with embedded HTML without corruption', () => {
    const xml = '<repomix>\n  <file path="src/component.html">\n    <div class="card">Hello &amp; Welcome</div>\n  </file>\n  <file path="src/main.ts">\n    console.log("TS code");\n  </file>\n</repomix>';
    const files = extractFiles(xml, 'repomix-output.xml');
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/component.html');
    expect(files[0].content).toContain('<div class="card">Hello & Welcome</div>');
    expect(files[1].path).toBe('src/main.ts');
  });
});

describe('Token Counter & Cost Estimator', () => {
  it('uses fast byte approximation by default and exact tokenization when specified', () => {
    const text = 'Hello world, this is a test repository semantic compression.';
    const approxCount = countTokens(text, false);
    const exactCount = countTokens(text, true);

    expect(approxCount).toBeGreaterThan(0);
    expect(exactCount).toBeGreaterThan(0);
    expect(typeof approxCount).toBe('number');
    expect(typeof exactCount).toBe('number');
  });

  it('handles empty string and falsy inputs safely', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens(null)).toBe(0);
    expect(countTokens(undefined)).toBe(0);
  });
});

describe('Focus Mode (Targeted Context Slicing)', () => {
  const sampleFiles = [
    {
      path: 'src/auth/service.ts',
      content: `
import { hashPassword } from '../utils/crypto';
export function login(username, password) {
  const hash = hashPassword(password);
  const token = generateToken(username, hash);
  const session = createSession(token);
  return session;
}
`
    },
    {
      path: 'src/utils/crypto.ts',
      content: `
export function hashPassword(pw: string): string {
  const salt = 'xyz';
  const hashed = pw + salt;
  console.log('heavy crypto logic');
  return hashed;
}
`
    },
    {
      path: 'src/components/Button.tsx',
      content: `
export const Button = () => {
  return <button>Click me</button>;
};
export const IconButton = () => {
  return <button>Icon</button>;
};
`
    }
  ];

  it('preserves full implementation for focused files, skeleton for 1-hop imports, and minimal summary for out-of-scope files', async () => {
    const result = await compressRepository(sampleFiles, { focus: 'src/auth', maxPreserveLines: 2 });

    expect(result).toContain('### File: src/auth/service.ts [FOCUS - FULL IMPLEMENTATION]');
    expect(result).toContain('const session = createSession(token);');

    expect(result).toContain('### File: src/utils/crypto.ts [DEPENDENCY - SKELETON]');
    expect(result).toContain('throw new Error');
    expect(result).not.toContain('heavy crypto logic');

    expect(result).toContain('### File: src/components/Button.tsx [OUT OF SCOPE - SUMMARY]');
    expect(result).toContain('Button, IconButton');
    expect(result).not.toContain('<button>Click me</button>');
  });
});

describe('Worker Threads Parallel Processing', () => {
  it('processes larger batches via worker threads while preserving deterministic file ordering', async () => {
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      path: `src/module_${String(i).padStart(2, '0')}.ts`,
      content: `export function compute${i}() {\n  const x = ${i};\n  const y = ${i + 1};\n  const z = ${i + 2};\n  return x + y + z;\n}`
    }));

    const result = await compressRepository(manyFiles, { maxPreserveLines: 1 });
    expect(result).toContain('### File: src/module_00.ts');
    expect(result).toContain('### File: src/module_24.ts');

    // Verify strict ordering
    const pos0 = result.indexOf('### File: src/module_00.ts');
    const pos24 = result.indexOf('### File: src/module_24.ts');
    expect(pos0).toBeLessThan(pos24);
  });

  it('gracefully handles and falls back when worker encounters corrupted file without crashing batch', async () => {
    // 25個以上のファイル群の中に意図的に壊れたコードを含むファイルを混入させ、Worker例外処理を通過させる
    const filesWithCorruption = Array.from({ length: 25 }, (_, i) => ({
      path: `src/mod_${i}.ts`,
      content: i === 5 ? 'export const invalid = {{{ syntax error' : `export function ok${i}() { return ${i}; }`
    }));

    const result = await compressRepository(filesWithCorruption, { maxPreserveLines: 1 });
    expect(result).toContain('### File: src/mod_0.ts');
    expect(result).toContain('### File: src/mod_5.ts');
    expect(result).toContain('syntax error'); // クラッシュせず生コードのままフォールバックされていること
  });
});

describe('P0 Bug Fixes & Regression Suite', () => {
  it('does not inject return statement into class constructor and preserves super()', () => {
    const classCode = `
class AuthService extends BaseService {
  constructor(config, logger) {
    super(config);
    this.logger = logger;
    this.initDatabase();
    console.log('Heavy constructor logic that should be folded');
  }
}
`;
    const result = skeletonizeWithAST(classCode, false, 2, false);
    expect(result).toContain('super(config);');
    expect(result).not.toContain('return null as any;');
    expect(result).not.toContain('Heavy constructor logic');
  });

  it('compresses useMemo and useCallback variable declarations while keeping dependency arrays', () => {
    const hookCode = `
export const DataViewer = ({ items, filter }) => {
  const filteredData = useMemo(() => {
    const intermediate = items.filter(i => i.active);
    return intermediate.map(i => i.name);
  }, [items, filter]);

  const handleSelect = useCallback((id) => {
    console.log('Item selected:', id);
    dispatch({ type: 'SELECT', payload: id });
  }, []);

  return <div>{filteredData.length}</div>;
};
`;
    const result = skeletonizeWithAST(hookCode, false, 2, true);
    expect(result).toContain('const filteredData = useMemo(() => {}, [items, filter]);');
    expect(result).toMatch(/const handleSelect = useCallback\((?:\(id\)|id) => \{\}, \[\]\);/);
    expect(result).not.toContain('const intermediate = items.filter');
    expect(result).not.toContain('Item selected:');
  });

  it('strictly resolves 1-hop imports avoiding prefix collisions, resolving index files and path aliases (@/, ~/)', () => {
    const allFiles = [
      { path: 'src/auth/service.ts' },
      { path: 'src/auth/service.test.ts' },
      { path: 'src/auth_helper.ts' },
      { path: 'src/utils/index.ts' },
      { path: 'src/utils/crypto.ts' },
      { path: 'components/Header.tsx' }
    ];

    const resolvedExact = resolveLocalImportPath('src/main.ts', './auth/service', allFiles);
    expect(resolvedExact).toBe('src/auth/service.ts');

    const resolvedIndex = resolveLocalImportPath('src/main.ts', './utils', allFiles);
    expect(resolvedIndex).toBe('src/utils/index.ts');

    // @/ および ~/ エイリアスの解決検証 (src/配下およびルート直下)
    const resolvedAtAlias = resolveLocalImportPath('src/main.ts', '@/utils/crypto', allFiles);
    expect(resolvedAtAlias).toBe('src/utils/crypto.ts');

    const resolvedTildeAlias = resolveLocalImportPath('src/main.ts', '~/components/Header', allFiles);
    expect(resolvedTildeAlias).toBe('components/Header.tsx');

    const notFound = resolveLocalImportPath('src/main.ts', './non_existent', allFiles);
    expect(notFound).toBeNull();
  });

  it('handles XML files with leading XML declarations without parser failure', () => {
    const xmlWithProlog = '<?xml version="1.0" encoding="UTF-8"?>\n<repomix>\n  <file path="src/index.js">\n    console.log("hello");\n  </file>\n</repomix>';
    const files = extractFiles(xmlWithProlog, 'repomix-output.xml');
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/index.js');
    expect(files[0].content).toContain('console.log("hello");');
  });

  it('throws explicit error when repomix artifact is missing and autoPack is false', () => {
    expect(() => findDefaultInputFile(false, 'non_existent_test_directory')).toThrow(/Repomix output file not found/);
  });

  it('preserves private class methods (#validate) matching core logic prefix', () => {
    const code = `
class SecurityManager {
  #validateToken(token) {
    if (!token) return false;
    if (token.isExpired) return false;
    return true;
  }
}
`;
    const result = skeletonizeWithAST(code, false, 2, false);
    expect(result).toContain('#validateToken(token)');
    expect(result).toContain('if (token.isExpired) return false;');
  });

  it('correctly handles PostgreSQL Dollar-quoted strings without breaking procedure statements', () => {
    const sql = `
CREATE OR REPLACE FUNCTION set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
    const result = optimizeSQL(sql);
    expect(result).toContain('CREATE OR REPLACE FUNCTION set_timestamp()');
    expect(result).toContain('NEW.updated_at = NOW();');
    expect(result).toContain('$$ LANGUAGE plpgsql;');
  });

  it('does not double-unescape XML entities in extracted source files', () => {
    const xml = '<repomix><file path="src/test.js">const text = &quot;&amp;lt;div&amp;gt;&quot;;</file></repomix>';
    const files = extractFiles(xml, 'repomix-output.xml');
    expect(files).toHaveLength(1);
    expect(files[0].content).toBe('const text = "&lt;div&gt;";');
  });

  it('resolves Windows backslash file paths and case-insensitive imports correctly', () => {
    const allFiles = [
      { path: 'src\\auth\\Service.ts' },
      { path: 'src\\utils\\crypto.ts' }
    ];

    const resolved = resolveLocalImportPath('src/main.ts', './auth/service', allFiles);
    expect(resolved).toBe('src\\auth\\Service.ts');
  });
});
describe('MCP Path Sanitization', () => {
  it('rejects path traversal attempts that escape the base directory', () => {
    expect(() => sanitizeInputPath('../secret.txt', '/tmp/base')).toThrow(/Access denied/);
    expect(() => sanitizeInputPath('../../etc/passwd', '/tmp/base')).toThrow(/Access denied/);
    expect(() => sanitizeInputPath('sub/../../outside.txt', '/tmp/base')).toThrow(/Access denied/);
    expect(() => sanitizeInputPath('/etc/passwd', '/tmp/base')).toThrow(/Access denied/);
    expect(sanitizeInputPath('sub/inside.txt', '/tmp/base')).toMatch(/inside\.txt$/);
  });
});

describe('YAML Optimizer', () => {
  it('strips full-line comments and collapses blank runs while preserving block scalars', () => {
    const yaml = `# Top level comment
name: my-app
version: 1.0.0

# Another comment

script: |
  # This is content, not a comment
  echo hello

# trailing comment
active: true
`;
    const result = optimizeYAML(yaml);
    expect(result).not.toContain('# Top level comment');
    expect(result).not.toContain('# Another comment');
    expect(result).toContain('# This is content, not a comment');
    expect(result).toContain('name: my-app');
    expect(result).toContain('active: true');
  });
});

describe('Dockerfile Optimizer', () => {
  it('preserves stage structure and truncates long RUN instructions', () => {
    const dockerfile = `FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci && \\
    npm run build && \\
    npm prune --production && \\
    rm -rf node_modules/.cache && \\
    find . -name '*.map' -delete && \\
    echo done

FROM node:20-alpine
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
`;
    const result = optimizeDockerfile(dockerfile);
    expect(result).toContain('FROM node:20 AS builder');
    expect(result).toContain('FROM node:20-alpine');
    expect(result).toContain('lines omitted from RUN');
    expect(result).toContain('CMD ["node", "dist/index.js"]');
  });

  it('keeps short RUN instructions untouched', () => {
    const dockerfile = 'FROM alpine\nRUN apk add --no-cache curl\nCMD ["sh"]\n';
    const result = optimizeDockerfile(dockerfile);
    expect(result).toContain('RUN apk add --no-cache curl');
  });
});

describe('Markdown Optimizer', () => {
  it('truncates long fenced code blocks while preserving headings and prose', () => {
    const longCode = Array.from({ length: 40 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const md = `# Title\n\nSome prose.\n\n\`\`\`js\n${longCode}\n\`\`\`\n\n## Section\n\nMore prose.\n`;
    const result = optimizeMarkdown(md);
    expect(result).toContain('# Title');
    expect(result).toContain('Some prose.');
    expect(result).toContain('## Section');
    expect(result).toContain('lines omitted');
    expect(result).not.toContain('const x39');
  });

  it('keeps short fenced code blocks intact', () => {
    const md = '# Title\n\n```js\nconst a = 1;\nconst b = 2;\n```\n';
    const result = optimizeMarkdown(md);
    expect(result).toContain('const a = 1;');
    expect(result).toContain('const b = 2;');
  });
});
