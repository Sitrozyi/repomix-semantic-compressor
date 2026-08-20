# repomix-semantic-compressor

Deterministic AST-based semantic context compressor for [Repomix](https://repomix.com) artifacts. Reduces LLM prompt token consumption while preserving complete TypeScript type signatures, React hook dependency graphs, state machine protocols, domain logic, and database schemas.

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.3.0-43853d.svg?style=flat-square)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-1.30%2B-8A2BE2.svg?style=flat-square)](https://modelcontextprotocol.io)
[![Babel AST](https://img.shields.io/badge/AST-Babel%207-F9DC3E.svg?style=flat-square)](https://babeljs.io/)
[![Tokenizer](https://img.shields.io/badge/Tokenizer-cl100k__base-orange.svg?style=flat-square)](https://github.com/openai/tiktoken)

---

## Table of Contents

- [Overview & Motivation](#overview--motivation)
  - [The Context Degradation Problem](#the-context-degradation-problem)
  - [Token Cost & Information Density](#token-cost--information-density)
- [Comparison: Raw Repomix vs. Regex Minification vs. AST Semantic Compressor](#comparison)
- [Why AST Parsing Over Regular Expressions](#why-ast-parsing-over-regular-expressions)
- [System Architecture & Processing Pipeline](#system-architecture--processing-pipeline)
- [Key Transformation Specifications](#key-transformation-specifications)
  - [1. AST Skeletonization & Type-Safe Return Injection](#1-ast-skeletonization--type-safe-return-injection)
  - [2. Domain Logic Whitelist Engine](#2-domain-logic-whitelist-engine)
  - [3. React Hook & Dependency Graph Extraction](#3-react-hook--dependency-graph-extraction)
  - [4. State Machine & Event Protocol Mining (`@payloads`)](#4-state-machine--event-protocol-mining-payloads)
  - [5. PostCSS Structural Layout & Design Token Isolation](#5-postcss-structural-layout--design-token-isolation)
  - [6. Delimiter-Safe SQL Schema & DDL Preservation](#6-delimiter-safe-sql-schema--ddl-preservation)
  - [7. HTML SVG & Base64 Payload Pruning](#7-html-svg--base64-payload-pruning)
  - [8. Repetitive JSX Component Subtree Folding](#8-repetitive-jsx-component-subtree-folding)
- [Targeted Focus Mode (3-Tier 1-Hop Slicing)](#targeted-focus-mode-3-tier-1-hop-slicing)
- [Transformation Examples (Before & After)](#transformation-examples-before--after)
  - [Example 1: TypeScript React Component with Hooks & Generics](#example-1-typescript-react-component-with-hooks--generics)
  - [Example 2: Redux Reducer & Event Emitter Protocol](#example-2-redux-reducer--event-emitter-protocol)
  - [Example 3: PostCSS Structural Layout Rules](#example-3-postcss-structural-layout-rules)
  - [Example 4: SQL DDL Schema vs. Bulk Seed Data](#example-4-sql-ddl-schema-vs-bulk-seed-data)
- [Installation & Quick Start](#installation--quick-start)
- [CLI Reference](#cli-reference)
- [Model Context Protocol (MCP) Server Integration](#model-context-protocol-mcp-server-integration)
  - [Claude Desktop Configuration](#claude-desktop-configuration)
  - [Cursor / Windsurf / VS Code Integration](#cursor--windsurf--vs-code-integration)
  - [MCP Tool Reference](#mcp-tool-reference)
- [Recommended AI Workflows](#recommended-ai-workflows)
- [Deterministic Guarantees & Security Properties](#deterministic-guarantees--security-properties)
- [Development & Testing](#development--testing)
- [License & Acknowledgments](#license--acknowledgments)

---

## Overview & Motivation

[Repomix](https://repomix.com) provides standard packaging of codebases into single file artifacts (`repomix-output.xml` or `repomix-output.json`) for consumption by Large Language Models. In large codebases (20k+ lines of code), submitting raw source code introduces two engineering bottlenecks:

### The Context Degradation Problem
As context length approaches model limits, LLM reasoning performance degrades over long spans of implementation boilerplate (e.g., standard JSX markup, repetitive CRUD methods, CSS rules, mock fixtures). The model's attention is diluted across routine implementations rather than focused on architecture, interface contracts, and business rules.

### Token Cost & Information Density
In iterative, multi-turn agent workflows (e.g., Cursor, Claude Desktop, autonomous refactoring loops), passing 200k+ uncompressed tokens per turn significantly increases API latency and operational cost.

```
+-------------------------------------------------------------------------+
| Raw Codebase Ingestion (Default Repomix)                                 |
| 250,000 tokens / turn ---> High Context Noise ---> Attention Dilution    |
+------------------------------------+------------------------------------+
                                     |
                                     v repomix-semantic-compressor
+-------------------------------------------------------------------------+
| Semantic Repository Skeleton (AST-Optimized)                            |
| 40,000 tokens / turn  ---> 100% Type Contracts & Protocols Retained     |
+-------------------------------------------------------------------------+
```

`repomix-semantic-compressor` functions as a deterministic semantic post-processor. It parses packaged repository outputs and reduces prompt token usage by 60% to 85% while preserving full interface contracts, type hierarchies, React hook dependency graphs, domain formulas, and database schemas.

---

## Comparison

| Dimension | Raw Repomix Output | Regex-Based Truncation | `repomix-semantic-compressor` |
| :--- | :--- | :--- | :--- |
| **Parsing Mechanism** | Text concatenation | Regular Expressions | **Babel AST + PostCSS Parser** |
| **TypeScript Generics** | Preserved | Often corrupts `<T extends ...>` | **100% Valid Syntax Preserved** |
| **Return Value Handling** | Full body | Empty braces (causes type errors) | **`return null as any;` Injection** |
| **Domain Logic Protection** | Full body | Stripped indiscriminately | **Prefix Whitelist (`is*`, `calc*`, etc.)** |
| **React Hook Extraction** | Full body | Stripped entirely | **Preserves `use*` & dependency arrays** |
| **Protocol Mining** | Implicit in body | Lost | **Extracts `@payloads` from switch/emit** |
| **CSS Optimization** | All rules | Naive line stripping | **Preserves Tokens & Layout properties** |
| **SQL Handling** | Full migrations | Semicolon collisions | **Preserves DDL, caps sample INSERTs** |
| **Targeted Slicing** | Not supported | Not supported | **3-Tier 1-Hop Dependency Graph** |
| **Agent Integration** | File-based | File-based | **Native Model Context Protocol (MCP)** |

---

## Why AST Parsing Over Regular Expressions

Regular expressions are inherently stateless and cannot reliably handle nested syntactic structures in modern TypeScript/JavaScript:

1. **Generic Arrow Functions**:
   ```typescript
   // Regex parsers often confuse TypeScript generics with JSX tags:
   export const identity = <T extends Record<string, any>>(val: T): T => { ... }
   ```
2. **Type-Safe Method Stubs**:
   Simply stripping a method body leaves invalid JavaScript or causes TypeScript return-type mismatches. An AST parser safely inserts `return null as any;` as the single terminal statement.
3. **Hook Dependency Array Preservation**:
   Regex cannot reliably differentiate between a 50-line callback body inside `useEffect` and its second parameter (`[userId, orgId]`), discarding the dependency graph.

`repomix-semantic-compressor` parses source code into an Abstract Syntax Tree using `@babel/parser` with TypeScript, JSX, Decorators, and Dynamic Import plugins enabled.

---

## System Architecture & Processing Pipeline

The transformation pipeline executes a single-pass extraction and compression cycle across all files contained within the Repomix artifact:

```
               +-------------------------------------------+
               |        repomix-output.xml / .json         |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |     fast-xml-parser / JSON Deserializer   |
               +---------------------+---------------------+
                                     |
       +-----------------------------+-----------------------------+
       |                                                           |
       v                                                           v
[ Code & Schema Assets ]                                  [ Static Assets & Data ]
 - TS / JS / TSX: Babel AST Engine                         - HTML / SVG: Prune long paths & data URIs
 - CSS / SCSS: PostCSS Layout Engine                       - JSON: Minify & normalize
 - SQL: Delimiter-Safe DDL Extractor                       - Other: Passthrough normalization
       |                                                           |
       +-----------------------------+-----------------------------+
                                     |
                                     v
               +-------------------------------------------+
               |       3-Tier Dependency Graph Engine      |
               |     (Focus File --> 1-Hop --> Out-Scope)  |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |      js-tiktoken (cl100k_base) Meter      |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |           repomix-optimized.md            |
               +-------------------------------------------+
```

---

## Key Transformation Specifications

### 1. AST Skeletonization & Type-Safe Return Injection
For functions, arrow functions, and class methods exceeding `maxPreserveLines` (default: 8 lines), the body is replaced by:
```typescript
return null as any;
```
This ensures the output remains valid TypeScript without type errors or unreachable code warnings during compiler or LLM evaluation.

### 2. Domain Logic Whitelist Engine
Functions representing core business rules or calculations are preserved in full regardless of line length. Functions matching the following regex are never skeletonized:
```javascript
const CORE_LOGIC_REGEX = /^(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/;
```

### 3. React Hook & Dependency Graph Extraction
React component bodies are pruned, but top-level state declarations (`useState`, `useRef`) and side-effect dependency graphs (`useEffect`, `useCallback`, `useMemo`) are extracted:
```typescript
// Extracted Output
const [user, setUser] = useState<User | null>(null);
const countRef = useRef<number>(0);
useEffect(() => {}, [userId]);
```

### 4. State Machine & Event Protocol Mining (`@payloads`)
Prior to body pruning, the AST is traversed to extract message contracts:
- **`switch(action.type)` cases**: Action types and destructuring from `action.payload` or `payload`.
- **Emitters & Dispatchers**: Calls to `emitter.emit('EVENT', ...)` and `dispatch({ type: 'ACTION' })`.
- **Constants**: String comparisons matching `/^[A-Z0-9_-]{3,}$/`.

Extracted contracts are formatted as doc comments:
```typescript
/* @payloads: LOGIN_USER(userId, authToken) | LOGOUT | emit:SESSION_START (truncated 45 lines) */
```

### 5. PostCSS Structural Layout & Design Token Isolation
Using `postcss`, stylesheets are filtered down to structural rules:
- **CSS Variables**: All `:root` variables and custom properties (`--*`) are 100% preserved.
- **Layout Properties**: Only positioning and layout declarations (`display`, `position`, `flex-*`, `grid-*`, `gap`, `overflow`, `z-index`, etc.) are retained.
- **Media Queries**: Responsive layouts defined in `@media`, `@supports`, and `@container` rules are preserved.
- **Decorative Classes**: Classes containing solely decorative rules (colors, shadows) are collapsed into a single summary comment.

### 6. Delimiter-Safe SQL Schema & DDL Preservation
SQL migrations are parsed with a state machine supporting quotes, backticks, line comments (`--`), and block comments (`/* ... */`):
- All DDL statements (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, etc.) are 100% preserved.
- Bulk `INSERT INTO` statements are capped at **2 sample rows per table**, with excess rows replaced by a summary comment.

### 7. HTML SVG & Base64 Payload Pruning
- Inline `<svg>` tags exceeding 150 characters have their interior paths replaced with a comment while preserving `id`, `class`, and `viewBox`.
- Long `data:image/...;base64` URIs are truncated to `data:image/...[base64 omitted]...`.

### 8. Repetitive JSX Component Subtree Folding
When 3 or more identical sibling JSX tags appear consecutively (e.g., list items, table rows), the AST collapses them into a representative element and a summary comment.

---

## Targeted Focus Mode (3-Tier 1-Hop Slicing)

When working on a specific subsystem, using `--focus <path-pattern>` constructs a 3-tier context representation:

```
               +------------------------------------------+
               |        Tier 1: Focus Targets             |
               |      (--focus src/auth/service.ts)       |
               |         [FULL IMPLEMENTATION]            |
               +--------------------+---------------------+
                                    |
            Static Local Imports    | (1-Hop Resolution: ./, ../)
                                    v
               +------------------------------------------+
               |     Tier 2: 1-Hop Dependencies           |
               |         (src/utils/crypto.ts)            |
               |       [AST SKELETONIZED TYPES]           |
               +--------------------+---------------------+
                                    |
            All Other Repositories  | (Non-Relevant Modules)
                                    v
               +------------------------------------------+
               |     Tier 3: Out-of-Scope Files           |
               |        (src/components/Button.tsx)       |
               |         [EXPORT SIGNATURE ONLY]          |
               +------------------------------------------+
```

1. **Tier 1 (Focus Targets)**: Files matching the pattern retain **full source code**.
2. **Tier 2 (1-Hop Dependencies)**: Modules directly imported via relative paths by Tier 1 files are **skeletonized** (type signatures and interfaces preserved, routine bodies stubbed).
3. **Tier 3 (Out-of-Scope Files)**: All remaining files are condensed into exported signature summaries:
   ```typescript
   // Exported signatures: Button, IconButton
   // [Non-focused implementation omitted]
   ```

---

## Transformation Examples (Before & After)

### Example 1: TypeScript React Component with Hooks & Generics

#### Input: `src/components/UserProfile.tsx` (42 lines)
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
  metadata,
  onSave
}: {
  userId: string;
  metadata: T;
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
      <h2>{user ? user.name : 'Loading...'}</h2>
      <button onClick={handleUpdate}>Save Changes</button>
    </div>
  );
};
```

#### Transformed Output: `repomix-optimized.md` (21 lines)
```tsx
### File: src/components/UserProfile.tsx
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
  metadata,
  onSave
}: {
  userId: string;
  metadata: T;
  onSave: (data: User) => Promise<void>;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const clickCount = useRef<number>(0);
  useEffect(() => {}, [userId]);
  /* ...impl (32 lines)... */
  return null as any;
};
```
```

---

### Example 2: Redux Reducer & Event Emitter Protocol

#### Input: `src/store/gameReducer.ts`
```typescript
export function gameReducer(state: GameState, action: Action, emitter: EventEmitter): GameState {
  emitter.emit('GAME_TICK', { timestamp: Date.now() });
  dispatch({ type: 'SYNC_ANALYTICS', payload: true });

  switch (action.type) {
    case 'CARD_PLAYED': {
      const { cardId, targetSlot, energyCost } = action.payload;
      const nextHand = state.hand.filter((c) => c.id !== cardId);
      const nextEnergy = state.energy - energyCost;
      return { ...state, hand: nextHand, energy: nextEnergy };
    }
    case 'END_TURN': {
      return { ...state, turn: state.turn + 1, energy: 3 };
    }
    default:
      return state;
  }
}
```

#### Transformed Output: `repomix-optimized.md`
```typescript
### File: src/store/gameReducer.ts
```typescript
export function gameReducer(state: GameState, action: Action, emitter: EventEmitter): GameState {
  /* @payloads: CARD_PLAYED(cardId, targetSlot, energyCost) | END_TURN | emit:GAME_TICK | dispatch:SYNC_ANALYTICS (truncated 17 lines) */
  return null as any;
}
```
```

---

### Example 3: PostCSS Structural Layout Rules

#### Input: `src/styles/dashboard.css`
```css
:root {
  --primary-color: #2563eb;
  --sidebar-width: 280px;
}

.dashboard-container {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
  background-color: #f8fafc;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.sidebar {
  display: flex;
  flex-direction: column;
  position: fixed;
  gap: 16px;
  border-right: 1px solid #e2e8f0;
  padding: 24px;
}

.user-badge {
  background: linear-gradient(135deg, #6ee7b7, #3b82f6);
  border-radius: 9999px;
  color: #ffffff;
}

@media (max-width: 768px) {
  .dashboard-container {
    display: flex;
    flex-direction: column;
  }
}
```

#### Transformed Output: `repomix-optimized.md`
```css
### File: src/styles/dashboard.css
```css
/* Design Tokens & CSS Variables */
:root {
  --primary-color: #2563eb;
  --sidebar-width: 280px;
}

/* Layout & Structural Rules */
.dashboard-container { display: grid; grid-template-columns: var(--sidebar-width) 1fr }
.sidebar { display: flex; flex-direction: column; position: fixed; gap: 16px }
@media (max-width: 768px) {
  .dashboard-container { display: flex; flex-direction: column }
}

/* Decorative/Component Classes (1 classes) */
.user-badge
```
```

---

### Example 4: SQL DDL Schema vs. Bulk Seed Data

#### Input: `db/schema_and_seeds.sql`
```sql
CREATE TABLE accounts (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO accounts (id, email) VALUES ('acc-1', 'admin;internal@org.com');
INSERT INTO accounts (id, email) VALUES ('acc-2', 'user1@org.com');
INSERT INTO accounts (id, email) VALUES ('acc-3', 'user2@org.com');
INSERT INTO accounts (id, email) VALUES ('acc-4', 'user3@org.com');
INSERT INTO accounts (id, email) VALUES ('acc-5', 'user4@org.com');
```

#### Transformed Output: `repomix-optimized.md`
```sql
### File: db/schema_and_seeds.sql
```sql
CREATE TABLE accounts (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO accounts (id, email) VALUES ('acc-1', 'admin;internal@org.com');

INSERT INTO accounts (id, email) VALUES ('acc-2', 'user1@org.com');

/* ... 3 redundant INSERT statements omitted for accounts ... */
```
```

---

## Installation & Quick Start

### Quick Execution (Zero Install)
```bash
npx repomix-compress [options]
```

### Local Dev Dependency
```bash
npm install -D repomix-semantic-compressor
```

Add context preparation scripts to `package.json`:
```json
{
  "scripts": {
    "context": "npx repomix && repomix-compress",
    "context:auth": "npx repomix && repomix-compress --focus src/auth -o auth-context.md"
  }
}
```

---

## CLI Reference

```text
Usage:
  npx repomix-compress [options]
  node bin/cli.mjs [options]

Options:
  -i, --input <path>               Input Repomix file (auto-detects .xml or .json)
  -o, --output <path>              Output file path (default: repomix-optimized.md)
  -f, --focus <pattern>            Retain full source for matched paths (3-tier slicing)
  -m, --max-preserve-lines <num>   Max line threshold to preserve function body (default: 8)
  -h, --help                       Show CLI help and exit
```

### Execution Telemetry
Every execution measures byte size and exact BPE token volume using `js-tiktoken` (`cl100k_base`):
```text
✔  Optimized 184 files in 92ms

  LLM Tokens:      248,320  →    39,120   (-84.2%)
  File Size:       1.1 MB   →   182.4 kB  (-83.4%)
  Est. Savings:  ~$0.6276 / prompt (Claude 3.5 Sonnet / GPT-4o input rate)
  Focus Filter:  src/payment
  Output File:   auth-context.md
```

---

## Model Context Protocol (MCP) Server Integration

`repomix-semantic-compressor` includes a native MCP server over `stdio`, allowing AI agents to query the semantic skeleton or retrieve individual files on demand.

### Claude Desktop Configuration

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

### Cursor / Windsurf / VS Code Integration

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
| `get_repo_skeleton` | `focus` *(string, optional)*<br>`input` *(string, optional)*<br>`maxPreserveLines` *(number, optional)* | Returns the compressed semantic skeleton of the repository. |
| `get_file_implementation` | `path` *(string, required)*<br>`input` *(string, optional)* | Retrieves the uncompressed source code for a specific file from the packed artifact. |
| `compress_repomix_file` | `input` *(string, optional)*<br>`output` *(string, optional)*<br>`focus` *(string, optional)*<br>`maxPreserveLines` *(number, optional)* | Compresses a target Repomix file and writes the resulting Markdown context to disk. |

---

## Recommended AI Workflows

### 1. Architectural Review & Dependency Audits
Submit `repomix-optimized.md` to an LLM:
> *"Attached is the AST-optimized semantic skeleton of our repository. Review the subsystem boundaries, identify potential circular dependencies, and critique our state management patterns across modules."*

### 2. Type-Safe Feature Implementation
Provide skeleton context to implement new modules conforming to existing interfaces:
> *"Using the type signatures and database schemas in this context, implement a `BillingService.ts` module that satisfies the existing `TransactionPayload` protocol."*

### 3. Agentic Navigation with MCP
1. Agent calls `get_repo_skeleton(focus: "src/auth")` to inspect the authentication architecture and its 1-hop dependencies.
2. If specific implementation details are required, the agent calls `get_file_implementation(path: "src/utils/crypto.ts")`.
3. Keeps total prompt token usage low across multi-turn sessions.

---

## Deterministic Guarantees & Security Properties

- **100% Local & Offline**: Operates strictly on local files using Babel AST and PostCSS. Zero outbound network requests or external LLM API dependencies.
- **Deterministic Transformations**: Identical input files and arguments produce bit-for-bit identical outputs.
- **Valid Target Syntax**: Pruned TypeScript/JavaScript files remain syntactically valid and parseable by standard tooling.

---

## Development & Testing

### Prerequisites
- Node.js `>= 18.3.0`
- npm `>= 9.0.0`

### Setup and Test Execution
```bash
# Clone repository
git clone https://github.com/Sitrozyi/repomix-semantic-compressor.git
cd repomix-semantic-compressor

# Install dependencies
npm install

# Run unit tests (Vitest)
npm test

# Run tests in watch mode
npm run test:watch
```

---

## License & Acknowledgments

This project is licensed under the [MIT License](./LICENSE).

### Acknowledgments
- [Repomix](https://github.com/yamadashy/repomix) for the repository packing format.
- [Babel](https://babeljs.io/) for JavaScript and TypeScript AST parsing.
- [PostCSS](https://postcss.org/) for CSS AST processing.
- [Model Context Protocol](https://modelcontextprotocol.io/) for standard tool integration.
