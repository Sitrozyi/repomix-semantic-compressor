<div align="center">

# Repomix Semantic Compressor

**Deterministic AST-driven context compression for LLM code reasoning.**

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![CI Status](https://img.shields.io/github/actions/workflow/status/Sitrozyi/repomix-semantic-compressor/ci.yml?branch=main&style=flat-square)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.3.0-informational.svg?style=flat-square)](package.json)
[![MCP Compatible](https://img.shields.io/badge/MCP-1.30%2B-green.svg?style=flat-square)](https://modelcontextprotocol.io)

<p align="center">
  <a href="#problem--motivation">Motivation</a> •
  <a href="#key-architectural-features">Architecture</a> •
  <a href="#transformation-pipeline">Pipeline</a> •
  <a href="#code-transformation-example">Before & After</a> •
  <a href="#installation--usage">Usage</a> •
  <a href="#mcp-server-integration">MCP Server</a> •
  <a href="#cli-reference">CLI Reference</a>
</p>

</div>

---

## Problem & Motivation

Packing entire codebases into LLM context windows (via tools like [Repomix](https://repomix.com)) creates two major bottlenecks:

1. **Context Window Dilution ("Lost in the Middle"):** Large context models suffer from degraded reasoning latency and recall accuracy when inundated with thousands of lines of boilerplate rendering code, styling, and redundant seed data.
2. **Exponential Token Ingestion Costs:** Full repository context payloads can easily reach 100k–300k+ tokens, costing $0.30 to $1.00+ per prompt cycle during multi-turn agentic workflows.

`repomix-semantic-compressor` performs **lossless architectural extraction**. It processes packed repository artifacts through abstract syntax tree (AST) traversers (Babel, PostCSS), replacing heavy procedural implementations with deterministic type annotations and protocol signatures, achieving **60%–80% token reduction** without corrupting syntax or breaking cross-file contracts.

---

## Key Architectural Features

### 1. Contract-Preserving AST Skeletonization
- **Full Type & Interface Retention:** All TypeScript type aliases, interfaces, function signatures, generics, and class structures remain intact.
- **Selective Body Pruning:** Function bodies exceeding the retention threshold (`default: 8 lines`) are safely truncated to `return null as any;` while keeping JSDoc/TSDoc comments intact.
- **Whitelist-Based Logic Preservation:** Essential core logic and predicate functions (`is*`, `has*`, `validate*`, `calc*`, `sanitize*`, etc.) are retained regardless of line count.

### 2. Protocol & State Machine Extraction
- **Action & Event Inference:** Automatically analyzes `switch-case` action reducers, `EventEmitter.emit()`, and `store.dispatch()` calls to generate semantic payload signatures (e.g., `/* @payloads: LOGIN(userId, token) | LOGOUT */`).

### 3. Component & Hook Surface Extraction
- **Top-Level React Hooks:** Retains `useState`, `useRef`, `useContext`, and dependency arrays for `useEffect` / `useCallback` while pruning heavy inner execution logic.
- **JSX List Deduplication:** Condenses repetitive mock/sibling JSX elements into single-node representative placeholders.

### 4. Multi-Format Structural Optimization
- **CSS / SCSS / LESS:** Extracts `:root` design tokens, CSS variables, and layout properties (`display`, `position`, `flex`, `grid`) while pruning purely decorative classes.
- **SQL:** Preserves complete DDL schemas (`CREATE TABLE`, `ALTER TABLE`, indexes) while truncating bulk `INSERT` statements to a 2-row representative sample.
- **HTML / Assets:** Collapses large SVG path vectors and inlined base64 data URIs.

### 5. 3-Tier Targeted Context Slicing (`--focus`)
When targeting specific modules (e.g., `--focus src/auth`), the engine builds a 1-hop dependency graph:
- **Tier 1 (Focus Target):** Full, uncompressed source code implementation.
- **Tier 2 (1-Hop Dependencies):** AST-skeletonized contracts and types.
- **Tier 3 (Out-of-Scope):** High-level export signature summaries.

---

## Code Transformation Example

### Input (Raw Implementation — ~280 Tokens)
```typescript
import { useState, useEffect } from 'react';

export interface UserSession {
  userId: string;
  roles: string[];
}

export function validatePermission(user: UserSession, requiredRole: string): boolean {
  if (!user || !user.roles) return false;
  return user.roles.includes(requiredRole);
}

export const UserProfileView = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUserData(userId).then((res) => {
      setProfile(res.data);
      setIsLoading(false);
    });
  }, [userId]);

  const handleUpdate = () => {
    dispatch({ type: 'USER_SYNC', payload: { id: userId, timestamp: Date.now() } });
    console.log('Update dispatched across network sockets...');
  };

  return (
    <div className="profile-container">
      <h1>{profile?.userId}</h1>
      <button onClick={handleUpdate}>Sync</button>
    </div>
  );
};
