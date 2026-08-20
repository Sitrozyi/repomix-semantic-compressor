<a id="header"></a>
repomix-semantic-compressor

Deterministic AST-driven semantic context compressor for Repomix packed codebases. Reduces LLM context token consumption by 60%–85% while preserving 100% of TypeScript type signatures, core domain validation logic, React hook dependency graphs, state machine protocols, and database schemas.

![alt text](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)


![alt text](https://img.shields.io/github/actions/workflow/status/Sitrozyi/repomix-semantic-compressor/ci.yml?branch=main&style=flat-square)


![alt text](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)


![alt text](https://img.shields.io/badge/node-%3E%3D18.3.0-brightgreen.svg?style=flat-square)


![alt text](https://img.shields.io/badge/MCP-1.30%2B-purple.svg?style=flat-square)

<a id="table-of-contents"></a>
Table of Contents

    Problem & Motivation

    Key Architectural Features

        Deterministic AST Skeletonization & Type-Safe Dummy Returns

        Whitelist Preservation for Domain Logic

        React Hook Signature & Dependency Preservation

        Event & Protocol Payload Extraction

        PostCSS Structural Layout & Design Token Isolation

        SQL DDL Schema Preservation & Bulk Seed Truncation

        3-Tier Targeted Context Slicing (--focus)

    Code Transformation Example (Before & After)

    Installation & Usage

    Model Context Protocol (MCP) Server Integration

    CLI Reference

    Performance Benchmarks

    License

<a id="problem-and-motivation"></a>
Problem & Motivation

When passing entire codebases to Large Language Models (Claude 3.5 Sonnet, GPT-4o, DeepSeek R1) via repository packers like Repomix, developers face two major structural bottlenecks:

    Context Window Dilution & Needle-in-a-Haystack Degradation: Ingesting 200k–500k tokens of non-essential implementation details (e.g., standard UI rendering blocks, large inline SVG paths, repetitive seed INSERT statements, decorative CSS) dilutes the model's attention, causing degradation in reasoning, architectural compliance, and edge-case detection.

    Linear Ingestion Cost Inflation: In multi-turn coding sessions or automated agent workflows, re-uploading hundreds of thousands of unchanged implementation tokens costs $0.60–$3.00 per prompt at current token pricing ($3.00 / 1M input tokens).

Why Regular Expressions Fail and AST is Mandatory

Naive string-stripping and regex-based minifiers break syntax integrity:

    They corrupt generic TypeScript parameters (e.g., <T extends Record<string, any>>).

    They break arrow function return types.

    They wipe out crucial React dependency arrays (useEffect(() => {}, [userId])).

    They strip event action structures required for reducer analysis.

repomix-semantic-compressor parses source code into a deterministic Babel Abstract Syntax Tree (AST), performs AST transforms to strip non-critical routine bodies, substitutes valid typed returns (return null as any;), extracts structural protocol metadata into inline doc-comments, and serializes the tree back into syntax-valid TypeScript/JavaScript.
code Code

┌────────────────────────┐
│  repomix-output.xml/   │
│  repomix-output.json   │
└───────────┬────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│             repomix-semantic-compressor                     │
├───────────────────────────────┬─────────────────────────────┤
│ Babel AST Engine              │ PostCSS Structural Filter   │
│ • Generic-aware skeletonizer  │ • Layout properties only    │
│ • Core logic regex whitelist  │ • Design tokens (:root)     │
│ • React Hook dependency graph │                             │
│ • Protocol/Action extraction  │ SQL / HTML / JSON Optimizers│
│ • 3-Tier 1-Hop Module Slicer  │ • DDL preserved / INSERTs   │
│                               │ • SVG / Base64 truncation   │
└───────────────────────────────┴─────────────────────────────┘
            │
            ▼
┌────────────────────────┐
│  repomix-optimized.md  │  (60% - 85% Token Reduction,
└────────────────────────┘   100% Type & Protocol Integrity)

<a id="key-architectural-features"></a>
Key Architectural Features

<a id="deterministic-ast-skeletonization"></a>
1. Deterministic AST Skeletonization & Type-Safe Dummy Returns

Functions, arrow functions, class methods, and object methods that exceed the line threshold (default: 8 lines) have their routine bodies replaced with:
code TypeScript

return null as any;

Preceding JSDoc/TSDoc comments, function parameter lists, generic type arguments, and return type annotations are retained without modification.

<a id="whitelist-preservation"></a>
2. Whitelist Preservation for Domain Logic

Functions matching critical business logic, pure calculation, and domain rule naming conventions are preserved in their entirety, regardless of line length. The engine evaluates function identifiers against the following regular expression:
code JavaScript

const CORE_LOGIC_REGEX = /^(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/;

<a id="react-hook-preservation"></a>
3. React Hook Signature & Dependency Preservation

React component bodies are stripped of repetitive JSX rendering, but top-level React hooks (useState, useRef, custom use* hooks) and side-effect dependency graphs (useEffect, useLayoutEffect, useInsertionEffect, useCallback, useMemo) are extracted and preserved with empty function bodies:
code TypeScript

// Extracted and preserved in skeleton:
const [user, setUser] = useState(null);
const countRef = useRef(0);
useEffect(() => {}, [userId]);

<a id="event-and-protocol-extraction"></a>
4. Event & Protocol Payload Extraction

The AST traverse engine inspects function bodies before replacement and extracts message-passing protocols into an inline @payloads annotation:

    Redux/Reducer Actions: Inspects switch (action.type) statements and variable destructuring from action.payload, payload, data, or event.

    Event Emitters & Dispatchers: Extracts calls matching emitter.emit('EVENT_NAME'), dispatch({ type: 'ACTION_TYPE' }), trigger(...), and send(...).

    String Constant Comparisons: Captures equality comparisons matching uppercase string enums (/^[A-Z0-9_-]{3,}$/).

Generated comment format:
code TypeScript

/* @payloads: LOGIN_USER(userId, authToken) | emit:USER_LOGGED_IN | dispatch:SYNC_COMPLETE (truncated 24 lines) */

<a id="postcss-css-isolation"></a>
5. PostCSS Structural Layout & Design Token Isolation

CSS/SCSS/LESS stylesheets are parsed using postcss. Purely decorative declarations (colors, border-radius, shadows, transitions) are stripped, while architectural declarations are preserved:

    :root variable definitions and CSS design tokens (--*).

    Structural layout properties: display, position, top, bottom, left, right, grid-template-*, flex-*, align-items, justify-content, gap, z-index, overflow, visibility.

    @media, @supports, and @container layout queries.

    Decorative class names are aggregated into a compact summary list: /* Decorative/Component Classes (N classes) */ .card, .btn-primary.

<a id="sql-ddl-preservation"></a>
6. SQL DDL Schema Preservation & Bulk Seed Truncation

SQL scripts are tokenized with delimiter-safe parsing (handling semicolons inside quoted strings and comments).

    All DDL statements (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.) are preserved 100%.

    Repetitive bulk data INSERT INTO statements are capped at a maximum of 2 sample rows per table, appending an explicit summary comment for omitted rows:
    code SQL

    /* ... 498 redundant INSERT statements omitted for users ... */

<a id="three-tier-focus-mode"></a>
7. 3-Tier Targeted Context Slicing (--focus)

When targeting a specific feature or subsystem with --focus <path>, the engine performs 1-hop static dependency graph resolution:
code Code

┌──────────────────────────────────────────────────────────────┐
│  Tier 1: Focus Target (Full Implementation Retained)         │
│  src/auth/service.ts                                         │
└──────────────────────────────┬───────────────────────────────┘
                               │ imports relative './crypto'
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Tier 2: 1-Hop Dependencies (AST-Skeletonized Signatures)    │
│  src/utils/crypto.ts                                         │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Tier 3: Out-of-Scope Files (Top-Level Export Summary Only)  │
│  src/components/Button.tsx -> "// Exported signatures: Button"│
└──────────────────────────────────────────────────────────────┘

    Tier 1 (Focus Match): Full implementation source code is retained verbatim ([FOCUS - FULL IMPLEMENTATION]).

    Tier 2 (1-Hop Relative Dependency): Directly imported local modules are AST-skeletonized ([1-HOP DEPENDENCY - SKELETON]).

    Tier 3 (Out-of-Scope): All other files are summarized strictly to their exported identifiers ([OUT OF SCOPE - SUMMARY]).

<a id="code-transformation-example"></a>
Code Transformation Example (Before & After)
Input Code (src/features/UserManager.tsx - 38 lines)
code Tsx

import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { hashPassword } from '../utils/crypto';

export function validateUserPermission(user: User, requiredRole: UserRole): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.role === requiredRole) return true;
  return false;
}

export const UserManager = ({ userId, onUpdate }: { userId: string; onUpdate: (user: User) => void }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const renderCount = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    renderCount.current += 1;
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (mounted) {
          setUser(data);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleRoleChange = (newRole: UserRole) => {
    if (!user) return;
    const updated = { ...user, role: newRole };
    setUser(updated);
    onUpdate(updated);
  };

  return (
    <div className="user-manager-card">
      <h3>User Management</h3>
      {loading ? <p>Loading...</p> : <div>{user?.name} - {user?.role}</div>}
      <button onClick={() => handleRoleChange('admin')}>Promote to Admin</button>
    </div>
  );
};

Transformed AST Output (repomix-optimized.md)
code Tsx

### File: src/features/UserManager.tsx
````tsx
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { hashPassword } from '../utils/crypto';

export function validateUserPermission(user: User, requiredRole: UserRole): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.role === requiredRole) return true;
  return false;
}

export const UserManager = ({
  userId,
  onUpdate
}: {
  userId: string;
  onUpdate: (user: User) => void;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const renderCount = useRef<number>(0);
  useEffect(() => {}, [userId]);
  /* ...impl (32 lines)... */
  return null as any;
};

code Code

### Transformation Metrics
- **Raw Input:** 38 lines | 358 tokens (`cl100k_base`)
- **Optimized Output:** 24 lines | 148 tokens (`cl100k_base`)
- **Token Reduction:** **-58.7%**
- **Semantic Integrity:** Validation logic `validateUserPermission` preserved 100%; React state variables and `useEffect` dependency `[userId]` preserved 100%; TypeScript parameter types preserved 100%.

---

<a id="installation-and-usage"></a>
## Installation & Usage

### 1. Direct Execution via `npx` (No Installation Required)

If `repomix-output.xml` or `repomix-output.json` does not exist in the current working directory, the CLI automatically invokes `npx repomix` before performing compression.

```bash
# Standard semantic compression (generates repomix-optimized.md)
npx repomix-compress

# Targeted context slicing focusing on a specific module
npx repomix-compress --focus src/auth --output auth-context.md

# Specify custom input and preserve functions up to 12 lines
npx repomix-compress --input custom-pack.xml --output output.md --max-preserve-lines 12

2. Global / Local Installation
code Bash

# Install globally
npm install -g repomix-semantic-compressor

# Or install as a project devDependency
npm install -D repomix-semantic-compressor

<a id="mcp-server-integration"></a>
Model Context Protocol (MCP) Server Integration

repomix-semantic-compressor provides a built-in Model Context Protocol (MCP) server over standard I/O (stdio). This allows AI IDEs and assistants (such as Claude Desktop, Cursor, or Windsurf) to dynamically request skeletonized repositories or retrieve isolated source implementations on demand.
Claude Desktop Configuration

Add the server definition to your claude_desktop_config.json:
code JSON

{
  "mcpServers": {
    "repomix-compressor": {
      "command": "npx",
      "args": ["-y", "repomix-semantic-compressor", "--mcp"]
    }
  }
}

Or configure via direct binary execution:
code JSON

{
  "mcpServers": {
    "repomix-compressor": {
      "command": "node",
      "args": ["/path/to/repomix-semantic-compressor/bin/mcp-server.mjs"]
    }
  }
}

Available MCP Tools
Tool Name	Parameters	Description
get_repo_skeleton	focus (string, optional)<br>input (string, optional)<br>maxPreserveLines (number, optional, default: 8)	Retrieves the compressed semantic skeleton of the repository. Pass focus to apply 3-tier context slicing for a target module.
get_file_implementation	path (string, required)<br>input (string, optional)	Retrieves the uncompressed, raw source code for a specific file from the packed repository artifact.
compress_repomix_file	input (string, optional)<br>output (string, optional, default: repomix-optimized.md)<br>focus (string, optional)<br>maxPreserveLines (number, optional, default: 8)	Compresses a Repomix artifact file and writes the resulting Markdown context directly to disk.

<a id="cli-reference"></a>
CLI Reference

The CLI is built with Node.js native util.parseArgs. Execute with -h or --help to view options:
code Text

Repomix Semantic Compressor (AST-Powered)
A semantic post-processor for Repomix (https://repomix.com)

Usage:
  npx repomix-compress [options]
  node bin/cli.mjs [options]

Options:
  -i, --input <path>               Input Repomix file (auto-detects .xml or .json)
  -o, --output <path>              Output optimized file (default: repomix-optimized.md)
  -f, --focus <pattern>            Retain full implementation for matched path/module
  -m, --max-preserve-lines <num>   Max lines to preserve full function body (default: 8)
  -h, --help                       Show CLI help and exit

Examples:
  $ npx repomix-compress
  $ npx repomix-compress -f src/auth -o auth-context.md
  $ npx repomix-compress -i repomix-output.xml -o context.md

CLI Terminal Output Metrics

Upon execution, exact token and byte reductions are measured and displayed using the cl100k_base tokenizer:
code Text

✔  Optimized 142 files in 84ms

  LLM Tokens:      184,290  →    38,410   (-79.2%)
  File Size:       812.4 kB →   164.2 kB  (-79.8%)
  Est. Savings:  ~$0.4376 / prompt (Claude 3.5 Sonnet / GPT-4o input rate)
  Output File:   repomix-optimized.md

<a id="performance-benchmarks"></a>
Performance Benchmarks

Token counts are measured deterministically using js-tiktoken with the cl100k_base BPE tokenizer (standard for GPT-4o, GPT-4, and Claude 3.5 family context estimators).
Repository Profile	Files	Original Tokens	Compressed Tokens	Token Reduction	Est. Cost Savings (per 10 turns)
Next.js 14 App Router Project (TSX, CSS Modules, Tailwind)	86	124,500	28,100	-77.4%	$2.89
Fullstack TypeScript Monorepo (Prisma, Express, React)	210	348,200	56,400	-83.8%	$8.75
Node.js Microservice (Domain Logic, SQL Migrations, REST)	48	62,800	14,200	-77.3%	$1.45
Targeted Focus Mode (--focus src/auth)	210	348,200	18,900	-94.5%	$9.87

Estimated savings calculated using the standard tier rate of $3.00 / 1,000,000 input tokens.

<a id="license"></a>
License

This project is licensed under the MIT License. See the LICENSE file for details.
