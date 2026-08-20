<div align="center">

# Repomix Semantic Compressor

**Deterministic AST-driven context compression for LLM code reasoning.**

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![CI Status](https://img.shields.io/github/actions/workflow/status/Sitrozyi/repomix-semantic-compressor/ci.yml?branch=main&style=flat-square)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.3.0-informational.svg?style=flat-square)](package.json)
[![MCP Compatible](https://img.shields.io/badge/MCP-1.30%2B-green.svg?style=flat-square)](https://modelcontextprotocol.io)

<p align="center">
  <a href="#motivation">Motivation</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#pipeline">Pipeline</a> •
  <a href="#example">Before & After</a> •
  <a href="#usage">Usage</a> •
  <a href="#mcp">MCP Server</a> •
  <a href="#cli">CLI Reference</a> •
  <a href="#benchmarks">Benchmarks</a>
</p>

</div>

---

<a id="motivation"></a>
## Problem & Motivation

Feeding entire codebases into LLM context windows (via tools like [Repomix](https://repomix.com)) introduces critical engineering trade-offs:

1. **Context Window Dilution ("Lost in the Middle"):** LLM reasoning and retrieval accuracy degrade significantly when saturated with thousands of lines of boilerplate rendering code, styling definitions, and repetitive seed fixtures.
2. **High Ingestion Cost & Latency:** Ingesting 100k–300k+ uncompressed tokens per prompt cycle adds substantial latency and cost during multi-turn agentic workflows.

`repomix-semantic-compressor` performs **lossless architectural extraction**. It parses packed repository artifacts through abstract syntax tree (AST) engines (Babel, PostCSS), replacing procedural implementation bodies with deterministic type annotations and protocol signatures—achieving **70%+ token reduction** while strictly preserving syntactic validity and cross-file API contracts.

---

<a id="architecture"></a>
## Key Architectural Features

### 1. Contract-Preserving AST Skeletonization
- **Full Type & Interface Retention:** All TypeScript type aliases, interfaces, function signatures, generics, and class declarations remain completely intact.
- **Selective Body Pruning:** Function bodies exceeding the retention threshold (`default: 8 lines`) are safely replaced with `return null as any;` while keeping JSDoc/TSDoc comments.
- **Whitelist-Based Logic Retention:** Critical predicate functions and mathematical utilities (`is*`, `has*`, `can*`, `should*`, `validate*`, `calc*`, `sanitize*`, etc.) are preserved regardless of line count.

### 2. Protocol & State Machine Extraction
- **Action & Event Inference:** Analyzes `switch-case` action reducers, `EventEmitter.emit()`, and `store.dispatch()` calls to annotate extracted action types and destructured payload parameters (e.g., `/* @payloads: LOGIN_USER(userId, authToken) | LOGOUT */`).

### 3. Component & Hook Surface Extraction
- **Top-Level React Hooks:** Retains `useState`, `useRef`, `useContext`, and dependency arrays for `useEffect` / `useCallback` to preserve state architecture while pruning heavy inner execution logic.
- **JSX List Deduplication:** Compresses repetitive mock or sibling JSX elements (`> 2` identical items) into single representative placeholders.

### 4. Multi-Format Structural Optimization
- **CSS / SCSS / LESS:** Extracts `:root` design tokens, CSS variables, and layout properties (`display`, `position`, `flex`, `grid`, `gap`, `z-index`) while summarizing decorative classes.
- **SQL:** Preserves complete DDL schemas (`CREATE TABLE`, `ALTER TABLE`, indexes) while truncating bulk `INSERT` statements to a 2-row representative sample per table.
- **HTML / Assets:** Strips large SVG path vectors (`<!-- [SVG Icon Path Omitted] -->`) and inlined base64 data URIs.

### 5. 3-Tier Targeted Context Slicing (`--focus`)
When analyzing specific sub-modules (e.g., `--focus src/auth`), the engine builds a 1-hop dependency graph:
- **Tier 1 (Focus Target):** Full, uncompressed source code implementation.
- **Tier 2 (1-Hop Dependencies):** AST-skeletonized contracts and types.
- **Tier 3 (Out-of-Scope):** Exported signature summaries.

---

<a id="pipeline"></a>
## Transformation Pipeline
