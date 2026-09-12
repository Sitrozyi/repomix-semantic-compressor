# repomix-semantic-compressor
Early release. API may change in future versions.
[![test](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml/badge.svg)](https://github.com/Sitrozyi/repomix-semantic-compressor/actions/workflows/test.yml)

Reduces Repomix prompt tokens by 48-70% (up to 80%+) while preserving TypeScript types, React hooks, and DB schemas. See [Benchmark](#benchmark).
> **Note:** Repomix is a tool that packs your repository into a single file for AI prompts.

![Demo](./assets/repomix-compressor-demo.gif)

## Features

- **Function Stubbing**: Prunes TS/JS function bodies while preserving type definitions and interfaces.
- **Domain Logic Protection**: Keeps critical functions matching `is*`, `calc*`, `validate*`, `auth*` intact.
- **Schema Extraction**: Retains CSS variables and SQL DDL schemas while stripping bulk seed rows.

## Usage

Run in your repository root. It automatically executes Repomix and generates `repomix-optimized.md`:

```bash
npx repomix-semantic-compressor
```

### Key Options

| Option | Description |
| :--- | :--- |
| `--focus <path>` | Keep full implementation for target module while skeletonizing the rest |
| `-o <file>` | Specify output file path |
| `-i <file>` | Specify input file directly (`.xml` / `.json`) |
| `--no-auto-pack` | Skip automatic Repomix execution |

### Example (Focus Mode)

```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

---

## MCP Integration

Add to your configuration file for Claude Desktop, Cursor, or Windsurf:

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

## Benchmark

Measured on 2026-09-12. Token counts use the fast byte-length approximation (`bytes / 3.8`); add `--exact-tokens` for BPE counts.

| Repository | Size (before) | Size (after) | Tokens (before) | Tokens (after) | Reduction |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `sindresorhus/ky` | 737 kB | 382 kB | 198,637 | 102,929 | -48.2% |
| `honojs/hono` | 2774 kB | 839 kB | 747,527 | 225,979 | -69.8% |
| `tailwindlabs/tailwindcss` | 5138 kB | 2183 kB | 1,384,441 | 588,376 | -57.5% |

To reproduce:

```bash
git clone https://github.com/Sitrozyi/repomix-semantic-compressor
cd repomix-semantic-compressor
npm install
npm run benchmark
```

## License

MIT (c) 2026 Sitrozyi
