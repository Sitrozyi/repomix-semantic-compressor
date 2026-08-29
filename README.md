# repomix-semantic-compressor

An AST-powered context compression tool that reduces Repomix prompt tokens by **70%+** while preserving critical context like TypeScript types, React hooks, and DB schemas.

> **Note:** Repomix is a tool that packs your repository into a single file for AI prompts.

![Demo](./aseets/repomix-compressor-demo.gif)

## Features
* **Smart Stubbing**: Prunes TS/Python function bodies while fully preserving type definitions and interfaces.
* **Domain Logic Protection**: Keeps critical functions matching `is*`, `calc*`, `validate*`, `auth*` intact.
* **Schema Extraction**: Retains CSS variables and SQL DDL schemas while stripping bulk seed rows.

## Usage

Run directly in your repository root. It automatically executes Repomix and generates `repomix-optimized.md`:

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

**Example (Focus Mode):**
```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

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

## License
MIT (c) 2026 Sitrozyi
