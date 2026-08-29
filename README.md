# repomix-semantic-compressor

AST-powered semantic context compressor for [Repomix](https://repomix.com). Reduces prompt tokens by **60%–85%** while preserving TypeScript types, React hooks, state protocols, and DB schemas.

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.3.0-43853d.svg?style=flat-square)](https://nodejs.org)
[![MCP Ready](https://img.shields.io/badge/MCP-1.30%2B-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)

---

## ⚡ Quick Start

### 1. Run (Zero Install)
Run in your repository root. It automatically runs Repomix if needed:
```bash
npx repomix-semantic-compressor
```
👉 Generates **`repomix-optimized.md`** (drop into Claude, ChatGPT, or Cursor).

### 2. Targeted Focus Mode
Keep full implementation for your target module and skeletonize the rest:
```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

---

## 💡 What It Does (Before vs After)

```tsx
// ❌ Before (Raw 40+ lines)                // ✅ After (AST Compressed ~10 lines)
export const UserCard = ({ user }) => {     export const UserCard = ({ user }) => {
  const [data, setData] = useState(null);     const [data, setData] = useState(null);
  useEffect(() => {                           useEffect(() => {}, [user.id]);
    fetchUser(user.id).then(setData);         /* ...impl (30 lines)... */
  }, [user.id]);                              return <div className="card">...</div>;
  return <div className="card">...</div>;   };
};
```
- **TypeScript / Python**: Function bodies are stubbed (`return null as any;` / `...`), preserving all types and signatures.
- **Business Logic**: Functions matching `is*`, `calc*`, `validate*`, `auth*` are **100% preserved**.
- **CSS / SQL**: Retains design tokens (`:root`), layout rules, and DDL schemas while pruning bulk seed rows.

---

## 🛠 CLI Options

```text
npx repomix-semantic-compressor [options]

  -f, --focus <pattern>            Target module path for 3-tier dependency slicing
  -o, --output <path>              Output file path (default: repomix-optimized.md)
  -i, --input <path>               Input Repomix file (auto-detects .xml/.json)
  -m, --max-preserve-lines <num>   Threshold to preserve short functions (default: 8)
  -e, --exact-tokens               Exact BPE cl100k_base token count (slower)
      --no-auto-pack               Disable automatic repomix execution
```

---

<details>
<summary><b>🤖 Model Context Protocol (MCP) Server Setup</b></summary>

Add to your `claude_desktop_config.json` or Cursor/Windsurf MCP settings:

```json
{
  "mcpServers": {
    "repomix-semantic-compressor": {
      "command": "npx",
      "args": ["-y", "repomix-semantic-compressor", "--mcp"]
    }
  }
}
```

**Available Tools:**
- `get_repo_skeleton(focus?, input?)`: Returns compressed semantic skeleton.
- `get_file_implementation(path)`: Fetches full uncompressed source for a specific file.
- `compress_repomix_file(input?, output?)`: Compresses artifact and writes to disk.
</details>

---

## License

MIT License (c) 2026 Sitrozyi
