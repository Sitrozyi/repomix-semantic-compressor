# repomix-semantic-compressor

[![test](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml/badge.svg)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml)

Context compressor for Repomix. Reduces prompt tokens by 45–70% typically (up to 80%+) by stubbing function bodies while preserving type contracts, interfaces, docstrings, and database schemas ([Benchmark](https://github.com/Sitrozyi/repomix-semantic-compressor#benchmark)).  

- **TypeScript / JavaScript**: Full AST-based compression via Babel. Function bodies are replaced with `throw new Error(...)` (inferred `never` return type), so strict type checkers pass without `any` escapes. React hook dependency arrays (`useEffect`, `useMemo`) are retained. Constructors and setters are the exception: constructors are emptied while preserving `super()` calls, and setters are emptied, since injecting `throw` there would break class initialization or violate the `set` contract.
- **Python / Go**: Line-based function stubbing. Signatures and leading `"""docstrings"""` are preserved; Python bodies become `raise NotImplementedError`, Go bodies become `panic(...)`.
- **Focus Mode** currently resolves imports and dependency graphs for TypeScript / JavaScript only. Python and Go files are compressed in full-repo mode but not dependency-traced.

![Demo](https://raw.githubusercontent.com/Sitrozyi/repomix-semantic-compressor/main/assets/repomix-compressor-demo.gif)

## How It Compresses

- **Action/Event Protocol Extraction (TS/JS)**: For truncated reducers, emitters, and dispatchers, `switch (action.type)` cases, `emitter.emit('X')`, `dispatch({ type: 'X' })`, and `action.payload.foo` destructuring are summarized into a single `@payloads` line (e.g. `LOGIN_USER(userId, authToken)`), preserving the wire contract without the implementation.
- **Core Logic Whitelist**: Keeps full implementations intact for functions matching predicate and data-handling patterns (`is*`, `has*`, `can*`, `should*`, `calc*`, `calculate*`, `validate*`, `check*`, `parse*`, `format*`, `sanitize*`, including `#privateMethods`).
- **JSX / TSX List Compaction**: Collapses runs of 3+ identical sibling elements (e.g., repeating `<li>`, `<tr>`, or card components) into a single sample element with an omission comment (e.g., `{/* ...3 repeating <li /> omitted... */}`).
- **Schemas & Assets**: Retains SQL DDL (`CREATE TABLE`) and preserves the first 2 `INSERT` statements per table as schema samples while collapsing subsequent rows. Keeps CSS `:root` tokens and layout rules while omitting decorative declarations. Truncates long SVG paths and base64 strings.
- **JSON**: Minifies JSON artifacts by parsing and re-serializing them, stripping redundant whitespace and trailing commas. No structural transformation is applied.
- **YAML**: Strips full-line comments and collapses blank runs, while leaving block scalars (`|`, `>`) verbatim since their content is string data, not comments.
- **Dockerfile**: Collapses long multi-line `RUN` instructions while preserving stage structure (`FROM`, `COPY`, `CMD`, `ENTRYPOINT`) and all other directives.
- **Markdown**: Truncates fenced code blocks longer than 32 lines. Headings, prose, tables, and short examples are preserved verbatim.

## Usage

Run in your repository root. Auto-pack is enabled by default: if neither `repomix-output.xml` nor `repomix-output.json` exists, it runs `npx repomix` automatically. Pass `--no-auto-pack` to disable this.

```bash
npx @sitrozyi/repomix-semantic-compressor
```

Or install globally to use the short `rsc` alias:

```bash
npm install -g @sitrozyi/repomix-semantic-compressor
rsc
```

### Options

| Option | Description |
| :--- | :--- |
| `-f, --focus <path>` | Retain full implementation for target path/module; skeletonize 1-hop imports; summarize the rest (TS/JS only) |
| `-o, --output <file>` | Output file path (default: `repomix-optimized.md`) |
| `-i, --input <file>` | Input artifact path (`.xml` or `.json`) |
| `-m, --max-preserve-lines <n>` | Max lines to keep without truncation (default: `8`). For TS/JS this counts the whole function including signature; for Python/Go it counts the body only. |
| `-e, --exact-tokens` | Use the exact `cl100k_base` BPE tokenizer instead of byte approximation |
| `--no-auto-pack` | Disable automatic Repomix execution if artifact is missing |

### Focus Mode

Keep full code for the module you are editing and reduce everything else to skeletons or summaries:

```bash
npx @sitrozyi/repomix-semantic-compressor --focus src/auth -o auth-context.md
```

Dependency tracing (import resolution, 1-hop dependency skeletons) is currently implemented for TypeScript / JavaScript. Files matching type/contract paths (`types/`, `interfaces/`, `models/`, `schemas/`, `constants/`, `contracts/`, `entities/`, and `*.d.ts`) are transitively followed so that type information stays complete. For Python and Go, Focus Mode still emits full implementations for matched files, but non-focused files are not dependency-resolved.

## MCP Server (Cursor / Claude Desktop / Windsurf)

Exposes semantic skeleton extraction and file inspection as MCP tools. Add to your MCP configuration:

```json
{
  "mcpServers": {
    "repomix-semantic-compressor": {
      "command": "npx",
      "args": ["-y", "@sitrozyi/repomix-semantic-compressor", "--mcp"]
    }
  }
}
```

### Exposed Tools

- `get_repo_skeleton`: Returns the compressed semantic skeleton of the workspace.
- `get_file_implementation`: Retrieves uncompressed full source code for a specific file.
- `compress_repomix_file`: Compresses a repomix artifact to a destination file.

## Benchmark

Measured on 2026-09-12 on real-world repositories. Token counts use byte-length approximation (`bytes / 3.8`); run with `--exact-tokens` for exact `cl100k_base` BPE counts.

| Repository | Language | Size (before) | Size (after) | Tokens (before) | Tokens (after) | Reduction |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| `sindresorhus/ky` | TypeScript | 737 kB | 382 kB | 198,637 | 102,929 | **-48.2%** |
| `honojs/hono` | TypeScript | 2,774 kB | 839 kB | 747,527 | 225,979 | **-69.8%** |
| `tailwindlabs/tailwindcss` | JS / CSS | 5,138 kB | 2,183 kB | 1,384,441 | 588,376 | **-57.5%** |
| `gin-gonic/gin` | Go | 849 kB | 454 kB | 228,807 | 122,329 | **-46.5%** |

To reproduce:

```bash
git clone https://github.com/Sitrozyi/repomix-semantic-compressor
cd repomix-semantic-compressor
npm install
npm run benchmark
```

`npm run benchmark` runs all four repositories shown in the table above. You can also pass a custom repository URL directly:

```bash
npm run benchmark -- https://github.com/gin-gonic/gin.git
```

## Requirements

- Node.js >= 18.3.0 (uses `node:worker_threads` and the global `performance` API).

## License

MIT (c) 2026 Sitrozyi
