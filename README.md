<a id="header"></a>
# repomix-semantic-compressor

Deterministic AST-driven semantic context compressor for [Repomix](https://repomix.com) packed codebases. Reduces LLM context token consumption by 60%–85% while preserving 100% of TypeScript type signatures, core domain validation logic, React hook dependency graphs, state machine protocols, and database schemas.

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg?style=flat-square)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![CI Status](https://img.shields.io/github/actions/workflow/status/Sitrozyi/repomix-semantic-compressor/ci.yml?branch=main&style=flat-square)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node: >=18.3.0](https://img.shields.io/badge/node-%3E%3D18.3.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![MCP: 1.30+](https://img.shields.io/badge/MCP-1.30%2B-purple.svg?style=flat-square)](https://modelcontextprotocol.io)

---

<a id="table-of-contents"></a>
## Table of Contents

- [Problem & Motivation](#problem-and-motivation)
- [Key Architectural Features](#key-architectural-features)
  - [Deterministic AST Skeletonization & Type-Safe Dummy Returns](#deterministic-ast-skeletonization)
  - [Whitelist Preservation for Domain Logic](#whitelist-preservation)
  - [React Hook Signature & Dependency Preservation](#react-hook-preservation)
  - [Event & Protocol Payload Extraction](#event-and-protocol-extraction)
  - [PostCSS Structural Layout & Design Token Isolation](#postcss-css-isolation)
  - [SQL DDL Schema Preservation & Bulk Seed Truncation](#sql-ddl-preservation)
  - [3-Tier Targeted Context Slicing (`--focus`)](#three-tier-focus-mode)
- [Code Transformation Example (Before & After)](#code-transformation-example)
- [Installation & Usage](#installation-and-usage)
- [Model Context Protocol (MCP) Server Integration](#mcp-server-integration)
- [CLI Reference](#cli-reference)
- [Performance Benchmarks](#performance-benchmarks)
- [License](#license)

---

<a id="problem-and-motivation"></a>
## Problem & Motivation

When passing entire codebases to Large Language Models (Claude 3.5 Sonnet, GPT-4o, DeepSeek R1) via repository packers like Repomix, developers face two major structural bottlenecks:

1. **Context Window Dilution & Needle-in-a-Haystack Degradation:** Ingesting 200k–500k tokens of non-essential implementation details (e.g., standard UI rendering blocks, large inline SVG paths, repetitive seed `INSERT` statements, decorative CSS) dilutes the model's attention, causing degradation in reasoning, architectural compliance, and edge-case detection.
2. **Linear Ingestion Cost Inflation:** In multi-turn coding sessions or automated agent workflows, re-uploading hundreds of thousands of unchanged implementation tokens costs $0.60–$3.00 per prompt at standard input token rates ($3.00 / 1M tokens).

### Why Regular Expressions Fail and AST is Mandatory

Naive string-stripping and regex-based minifiers break syntax integrity:
- They corrupt generic TypeScript parameters (e.g., `<T extends Record<string, any>>`).
- They break arrow function return types.
- They wipe out crucial React dependency arrays (`useEffect(() => {}, [userId])`).
- They strip event action structures required for reducer analysis.

`repomix-semantic-compressor` parses source code into a deterministic **Babel Abstract Syntax Tree (AST)**, performs AST transforms to strip non-critical routine bodies, substitutes valid typed returns (`return null as any;`), extracts structural protocol metadata into inline doc-comments, and serializes the tree back into syntax-valid TypeScript/JavaScript.

```text
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
