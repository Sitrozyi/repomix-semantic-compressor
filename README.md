# repomix-semantic-compressor

AST-powered semantic context compressor for Repomix output artifacts. Reduces prompt token consumption by 60% to 85% while preserving TypeScript type contracts, JSX component hierarchies, React hook dependency graphs, state machine protocols, and database schemas.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.3.0-43853d.svg?style=flat-square)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.30%2B-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)
[![Babel AST](https://img.shields.io/badge/AST-Babel%207-F9DC3E.svg?style=flat-square)](https://babeljs.io/)

---

## Quick Start

### 1. One-Line Execution (No Installation Required)

Pack your repository with Repomix and compress it immediately into an LLM-optimized semantic context file (`repomix-optimized.md`):

```bash
npx repomix && npx repomix-semantic-compressor
```

*(If `repomix-output.xml` is missing, `repomix-semantic-compressor` automatically runs `npx repomix` by default.)*

### 2. Targeted Focus Mode (Feature-Specific Context)

Keep full implementation for your target module, skeletonize 1-hop dependencies, and collapse out-of-scope files to export signatures:

```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

### 3. Add to `package.json`

```json
{
  "scripts": {
    "context": "repomix && repomix-compress",
    "context:auth": "repomix && repomix-compress --focus src/auth -o auth-context.md"
  },
  "devDependencies": {
    "repomix": "^0.2.0",
    "repomix-semantic-compressor": "^1.0.0"
  }
}
```

---

## Key Features

- **AST-Based Semantic Skeletonization**: Uses Babel AST (`@babel/parser`) to prune routine function bodies while injecting type-safe stubs (`return null as any;`), preventing TypeScript syntax and compiler errors.
- **JSX Component Hierarchy Preservation**: Keeps top-level state declarations (`useState`), effect dependencies (`useEffect`), and the root JSX layout tree so LLMs retain UI structural context.
- **Protocol & Payload Mining (`@payloads`)**: Extracts message contracts from `switch(action.type)` cases (including TypeScript Enums), `emitter.emit()`, and `dispatch()` into inline JSDoc comments.
- **Domain Logic Whitelist**: Automatically protects business-critical validation, calculation, and authorization functions matching `/^(is|has|calc|validate|auth|verify|normalize)...` regardless of line length.
- **Multi-Modal Asset Optimization**:
  - **CSS / SCSS**: Retains `:root` variables, design tokens, and layout properties (`display`, `position`, `grid`, `flex`, `@media`) via PostCSS. Decorative styling is collapsed.
  - **SQL**: Preserves DDL schemas (`CREATE TABLE`, `ALTER TABLE`) and caps repetitive `INSERT` seed rows to 2 samples per table.
  - **HTML / SVG**: Truncates large vector path payloads and base64 data URIs.
- **Native Model Context Protocol (MCP) Server**: Integrates directly with Cursor, Claude Desktop, and Windsurf for on-demand context retrieval.

---

## Before & After Example

### Input: `src/components/UserProfile.tsx` (Raw Source)

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { calculateUserScore } from '../utils/scoring';

export function isUserAdmin(user: User): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.permissions.includes('ALL');
}

export const UserProfile = <T extends Record<string, any>>({
  userId,
  onSave
}: {
  userId: string;
  onSave: (data: User) => Promise<void>;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const clickCount = useRef<number>(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          setUser(data);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleUpdate = async () => {
    if (!user) return;
    clickCount.current++;
    await onSave(user);
  };

  return (
    <div className="profile-container">
      <Sidebar user={user} />
      <div className="content">
        <h2>{user ? user.name : 'Loading...'}</h2>
        <button onClick={handleUpdate}>Save Changes</button>
      </div>
    </div>
  );
};
```

### Transformed: `repomix-optimized.md` (AST Compressed Context)

```tsx
### File: src/components/UserProfile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { calculateUserScore } from '../utils/scoring';

// Domain logic preserved in full
export function isUserAdmin(user: User): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.permissions.includes('ALL');
}

export const UserProfile = <T extends Record<string, any>>({
  userId,
  onSave
}: {
  userId: string;
  onSave: (data: User) => Promise<void>;
}) => {
  // Reactive hooks and dependencies preserved
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const clickCount = useRef<number>(0);
  useEffect(() => {}, [userId]);

  // Implementation folded; UI structural layout preserved
  /* ...impl (35 lines)... */
  return (
    <div className="profile-container">
      <Sidebar user={user} />
      <div className="content">
        <h2>{user ? user.name : 'Loading...'}</h2>
        <button onClick={handleUpdate}>Save Changes</button>
      </div>
    </div>
  );
};
```

---

## Targeted Focus Mode (3-Tier Context Slicing)

When passing `--focus <path-pattern>`, the compressor analyzes import graphs and constructs a 3-tier gradient:

```
[ Tier 1: Target Files (--focus src/auth) ] ───────── Full implementation retained (100%)
                   │
                   ▼ (1-hop local static imports)
[ Tier 2: Dependencies (src/utils/crypto.ts) ] ────── AST skeletonized signatures & types
                   │
                   ▼ (unrelated repository files)
[ Tier 3: Out of Scope (src/views/Settings.tsx) ] ─── Exported signatures summary only
```

---

## CLI Reference

```text
Usage:
  npx repomix-semantic-compressor [options]
  repomix-compress [options]

Options:
  -i, --input <path>               Input Repomix artifact (.xml or .json, auto-detected if omitted)
  -o, --output <path>              Output file path (default: repomix-optimized.md)
  -f, --focus <pattern>            Target module path for 3-tier dependency slicing
  -m, --max-preserve-lines <num>   Threshold to preserve small utility functions (default: 8)
  -e, --exact-tokens               Calculate tokens using exact BPE cl100k_base (default: false)
      --no-auto-pack               Disable automatic repomix execution if artifact is missing
  -h, --help                       Show CLI help and exit
```

---

## Model Context Protocol (MCP) Integration

Run as an MCP server to let AI agents inspect skeletons and retrieve full implementations on demand.

### 1. Claude Desktop Configuration

Add to `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

### 2. Cursor / Windsurf Configuration

```json
{
  "mcpServers": {
    "repomix-semantic-compressor": {
      "command": "node",
      "args": ["./node_modules/repomix-semantic-compressor/bin/mcp-server.mjs"]
    }
  }
}
```

### Available MCP Tools

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `get_repo_skeleton` | `focus` *(string)*, `input` *(string)*, `maxPreserveLines` *(number)* | Returns the compressed semantic skeleton of the codebase. |
| `get_file_implementation` | `path` *(string, required)*, `input` *(string)* | Fetches the full uncompressed source code for a specific file on demand. |
| `compress_repomix_file` | `input` *(string)*, `output` *(string)*, `focus` *(string)* | Compresses an artifact and writes output markdown to disk. |

---

## Performance & Telemetry

Tested on a 184-file TypeScript/React repository:

```text
Optimized 184 files in 88ms

  LLM Tokens:      248,320  ->    39,120   (-84.2%)
  File Size:       1.1 MB   ->   182.4 kB  (-83.4%)
  Est. Savings:  ~$0.6276 / prompt (Claude 3.5 Sonnet / GPT-4o input rate)
```

---

## Development & Testing

```bash
# Clone repository
git clone https://github.com/Sitrozyi/repomix-semantic-compressor.git
cd repomix-semantic-compressor

# Install dependencies
npm install

# Run Vitest test suite
npm test
```

---

## License

MIT License (c) 2026 Sitrozyi
