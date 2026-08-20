import { describe, it, expect } from 'vitest';
import { skeletonizeWithAST, summarizeCSS, optimizeHTML, extractFiles } from '../src/core.mjs';

describe('AST Skeletonizer (skeletonizeWithAST)', () => {
  it('preserves short utility & calculation functions (<= 8 lines)', () => {
    const code = 'function calculateDamage(base, modifier) {\n  const finalVal = base * modifier;\n  return Math.max(0, finalVal);\n}';
    const result = skeletonizeWithAST(code, false, 8);
    expect(result).toContain('const finalVal = base * modifier;');
    expect(result).toContain('return Math.max(0, finalVal);');
  });

  it('preserves core whitelist functions (is*, validate*, calc*) even if longer than maxPreserveLines', () => {
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
    const result = skeletonizeWithAST(tsxCode, true, 2);
    expect(result).toContain('interface UserState<T>');
    expect(result).toContain('export const UserCard =');
    expect(result).not.toContain('console.log("clicked");');
  });
});

describe('CSS Semantic Optimizer (summarizeCSS)', () => {
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
});

describe('HTML/SVG Optimizer (optimizeHTML)', () => {
  it('truncates large SVG path payloads and base64 images', () => {
    const html = '<div class="icon-container">\n  <svg id="logo" viewBox="0 0 100 100">\n    <path d="M10 80 Q 52.5 10, 95 80 T 180 80 M10 80 Q 52.5 10, 95 80 T 180 80 M10 80 Q 52.5 10, 95 80 T 180 80" fill="red"/>\n  </svg>\n  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" />\n</div>';
    const result = optimizeHTML(html);
    expect(result).toContain('<svg id="logo"><!-- [SVG Icon Path Omitted] --></svg>');
    expect(result).toContain('data:image/...[base64 omitted]...');
  });
});

describe('Fast-XML & JSON Extractor (extractFiles)', () => {
  it('parses XML Repomix output with embedded HTML without corruption', () => {
    const xml = '<repomix>\n  <file path="src/component.html">\n    <div class="card">Hello &amp; Welcome</div>\n  </file>\n  <file path="src/main.ts">\n    console.log("TS code");\n  </file>\n</repomix>';
    const files = extractFiles(xml, 'repomix-output.xml');
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/component.html');
    expect(files[0].content).toContain('<div class="card">Hello & Welcome</div>');
    expect(files[1].path).toBe('src/main.ts');
  });
});
