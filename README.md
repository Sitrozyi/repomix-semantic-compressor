# repomix-semantic-compressor

[![test](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml/badge.svg)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml)

Context compressor for Repomix. On tested repositories it reduces prompt tokens by 45–80% by replacing function bodies while preserving type contracts, interfaces, docstrings, and database schemas ([Benchmark](#benchmark)).

- **TypeScript / JavaScript**: Full AST-based compression via Babel. Function bodies are replaced with `throw new Error(...)` (inferred `never` return type), so strict type checkers pass without `any` escapes. React hook dependency arrays (`useEffect`, `useMemo`) are retained.
- **Python / Go**: Line-based function stubbing. Signatures and leading `"""docstrings"""` are preserved; Python bodies become `raise NotImplementedError`, Go bodies become `panic(...)`.
- **Focus Mode** currently resolves imports and dependency graphs for TypeScript / JavaScript only. Python and Go files are compressed in full-repo mode but not dependency-traced.

![Demo](./assets/repomix-compressor-demo.gif)

## How It Compresses

- **Domain Logic Protection**: Keeps implementations intact for utility/logic functions matching `is*`, `has*`, `can*`, `calc*`, `validate*`, `check*`, etc.
- **Schemas & Assets**: Retains SQL DDL (`CREATE TABLE`) while truncating bulk `INSERT` seeds. Keeps CSS `:root` tokens and layout properties while omitting decorative rules. Truncates long SVG paths and base64 strings.

## Usage

Run in your repository root. If `repomix-output.xml` does not exist, it runs `npx repomix` automatically:

```bash
npx repomix-semantic-compressor
```

### Options

| Option | Description |
| :--- | :--- |
| `-f, --focus <path>` | Retain full implementation for target path/module; skeletonize 1-hop imports; summarize the rest (TS/JS only) |
| `-o, --output <file>` | Output file path (default: `repomix-optimized.md`) |
| `-i, --input <file>` | Input artifact path (`.xml` or `.json`) |
| `-m, --max-preserve-lines <n>` | Max body lines to keep without truncation (default: `8`) |
| `-e, --exact-tokens` | Use exact BPE tokenizer instead of byte approximation |
| `--no-auto-pack` | Disable automatic Repomix execution if artifact is missing |

### Focus Mode

Keep full code for the module you are editing and reduce everything else to skeletons or summaries:

```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

Dependency tracing (import resolution, 1-hop dependency skeletons) is currently implemented for TypeScript / JavaScript. For Python and Go, Focus Mode still emits full implementations for matched files, but non-focused files are not dependency-resolved.

## MCP Server (Cursor / Claude Desktop / Windsurf)

Exposes semantic skeleton extraction and file inspection as MCP tools. Add to your MCP configuration:

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

### Exposed Tools

- `get_repo_skeleton`: Returns the compressed semantic skeleton of the workspace.
- `get_file_implementation`: Retrieves uncompressed full source code for a specific file.
- `compress_repomix_file`: Compresses a repomix artifact to a destination file.

## Benchmark

Measured on real-world repositories. Token counts use byte-length approximation (`bytes / 3.8`); run with `--exact-tokens` for exact BPE counts.

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

## License

MIT (c) 2026 Sitrozyi
