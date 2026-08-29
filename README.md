# repomix-semantic-compressor

AST-powered semantic context compressor for [Repomix](https://repomix.com) artifacts. Reduces LLM prompt token consumption by **60% to 85%** while preserving TypeScript type contracts, JSX component hierarchies, React hook dependency graphs, state machine protocols, Python definitions, and database schemas.

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.3.0-43853d.svg?style=flat-square)](https://nodejs.org)
[![MCP Ready](https://img.shields.io/badge/MCP-1.30%2B-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)
[![Babel AST](https://img.shields.io/badge/AST-Babel%207-F9DC3E.svg?style=flat-square)](https://babeljs.io/)
[![Offline Safe](https://img.shields.io/badge/Security-100%25%20Offline-green.svg?style=flat-square)](https://github.com/Sitrozyi/repomix-semantic-compressor)

---

## Why Use This?

[Repomix](https://repomix.com) is the standard tool for packaging an entire codebase into a single AI-friendly document. However, passing hundreds of thousands of raw tokens to an LLM introduces severe bottlenecks:
- **Context Degradation & Attention Loss**: LLMs struggle with multi-hop reasoning when buried under thousands of lines of routine function bodies, bulk data fixtures, and CSS markup.
- **High Token Costs & Latency**: Large payloads slow down multi-turn AI interactions (Cursor, Claude, ChatGPT) and quickly deplete token budgets.

`repomix-semantic-compressor` parses repository artifacts with deterministic AST engines (Babel, PostCSS) to strip routine implementations while **strictly retaining 100% of interfaces, type definitions, domain formulas, and state flows**.

---

## Quick Start

### 1. One-Command Optimization (Zero Config)

Run directly in any project root. If `repomix-output.xml` is not found, it automatically executes `npx repomix` first:

```bash
npx repomix-semantic-compressor
```
*Output generated:* `repomix-optimized.md` *(reduced by ~80% token volume)*

### 2. How to Use the Output

- **ChatGPT / Claude Desktop**: Drag and drop `repomix-optimized.md` into your chat for complete architectural awareness at a fraction of the token cost.
- **Cursor / Windsurf**: Add `repomix-optimized.md` as context (`@repomix-optimized.md`) for full-repository understanding during refactoring.

### 3. Targeted Focus Mode (Feature Slicing)

Retain full implementation for your target feature while skeletonizing everything else into export signatures:

```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

### 4. Add to `package.json`

```json
{
  "scripts": {
    "context": "repomix-semantic-compressor",
    "context:auth": "repomix-semantic-compressor --focus src/auth -o auth-context.md"
  },
  "devDependencies": {
    "repomix-semantic-compressor": "^1.0.0"
  }
}
```
*(CLI alias `repomix-compress` is also available.)*

---

## Multi-Modal Optimization Matrix

| Asset Type | Supported Formats | Transformation Strategy |
| :--- | :--- | :--- |
| **TypeScript / JavaScript** | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | Strips function bodies with type-safe `return null as any;` stubs. Preserves type signatures, generics, and React hook dependencies (`useState`, `useEffect`). |
| **Python** | `.py` | Preserves class structures, method signatures, and docstrings. Replaces long implementation blocks with `...`. |
| **Stylesheets** | `.css`, `.scss`, `.less` | Retains `:root` design tokens, CSS variables, and layout properties (`display`, `position`, `grid`, `flex`, `@media`). Collapses decorative classes. |
| **Database** | `.sql` | Preserves 100% of DDL schema (`CREATE TABLE`, `ALTER TABLE`, indexes, triggers). Caps repetitive `INSERT` seed rows to 2 sample records per table. |
| **HTML / SVG** | `.html`, `.htm` | Truncates bloated SVG vector paths and inline Base64 data URIs. |
| **Data & Config** | `.json`, Arrays, Master Tables | Minifies JSON. Samples large static tables while preserving column schema definitions. |

---

## Before & After Transformation Example

### Input: `src/components/UserProfile.tsx` (Raw Source)

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
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

### Transformed Output: `repomix-optimized.md` (AST Compressed Context)

```tsx
### File: src/components/UserProfile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { calculateUserScore } from '../utils/scoring';

// Domain logic preserved in full by whitelist engine
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

  // Routine handler folded; UI structural layout preserved
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

## Key Features

### 1. Domain Logic Protection Whitelist
Functions containing business calculations or verification rules are never truncated, regardless of length. Any function matching the following pattern is preserved in full:
```regex
/^(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize|auth|authorize|authenticate|verify|normalize|transform|diff|resolve)[A-Z0-9_]/
```

### 2. State Machine & Event Mining (`@payloads`)
Automatically inspects internal `switch (action.type)` blocks, `dispatch({ type })`, and `emitter.emit('EVENT')` calls, distilling them into concise JSDoc protocol annotations:
```typescript
/* @payloads: CARD_PLAYED(cardId, targetSlot) | END_TURN | emit:GAME_TICK (truncated 42 lines) */
```

### 3. Targeted Focus Mode (3-Tier 1-Hop Slicing)
When `--focus <path-pattern>` is specified, the dependency resolution engine constructs a 3-tier gradient:
```
[ Tier 1: Target Files (--focus src/auth) ] ───────── Full source code retained (100%)
                   │
                   ▼ (1-hop static local imports)
[ Tier 2: Direct Dependencies (src/utils/crypto.ts) ] ── AST skeletonized signatures & types
                   │
                   ▼ (unrelated repository modules)
[ Tier 3: Out-of-Scope Files (src/views/Settings.tsx) ] ─ Condensed export signature summaries
```

---

## Model Context Protocol (MCP) Integration

Built-in native MCP server running over `stdio`, enabling AI agents (Claude Desktop, Cursor, Windsurf) to dynamically inspect skeletons and retrieve full implementations on demand.

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

### MCP Tool Reference

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `get_repo_skeleton` | `focus` *(string)*, `input` *(string)*, `maxPreserveLines` *(number)* | Returns the compressed semantic skeleton of the repository. |
| `get_file_implementation` | `path` *(string, required)*, `input` *(string)* | Fetches the full uncompressed source code for a specific file on demand. |
| `compress_repomix_file` | `input` *(string)*, `output` *(string)*, `focus` *(string)* | Compresses a target Repomix file and writes the Markdown context to disk. |

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

## Recommended Workflows & Limitations

### Best Used For:
- **Repository Architecture Reviews**: Evaluating module boundaries, state management, and design patterns.
- **Type-Safe Feature Scaffolding**: Asking LLMs to write new modules that strictly conform to existing interfaces and database schemas.
- **Cross-Module Refactoring Plans**: Auditing dependency graphs and interface contracts without token bloat.

### Not Recommended For:
- **Deep Single-Function Bug Fixing**: If an LLM needs to debug an intricate algorithm inside an un-whitelisted function body, use `--focus <file-path>` or the `get_file_implementation` MCP tool to supply full uncompressed source code.

---

## Security & Determinism

- **100% Local & Offline**: Operates strictly on your machine using local AST parsers. Zero network calls or external API dependencies.
- **Deterministic Output**: Identical code and parameters produce bit-for-bit identical markdown context.
- **Valid Syntactic Output**: Pruned files remain valid TypeScript/JavaScript, preventing compiler syntax errors during LLM inference.

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
