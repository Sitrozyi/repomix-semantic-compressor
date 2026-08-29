# repomix-semantic-compressor

AST-powered semantic context compressor for [Repomix](https://repomix.com). Reduces prompt token volume by **60%–85%** while preserving TypeScript types, React hooks, state machine protocols, and database schemas.

---

## Quick Start

### 1. Run directly (No installation required)

Run in your repository root. It automatically executes Repomix if needed:

```bash
npx repomix-semantic-compressor
```

Output generated: `repomix-optimized.md` (ready to attach to Claude, ChatGPT, or Cursor).

### 2. Targeted Focus Mode

Keep full implementation for your target module and skeletonize the rest:

```bash
npx repomix-semantic-compressor --focus src/auth -o auth-context.md
```

### 3. Add to project (Optional)

```bash
npm install -D repomix-semantic-compressor
```

---
## Before & After

<p align="center">
  <img src="images/demo.gif" alt="Token Reduction Demo" width="100%">
</p>

- **TypeScript / Python**: Function bodies are stubbed (`return null as any;` / `...`), preserving interfaces and type signatures.
- **Domain Logic**: Critical functions matching `is*`, `calc*`, `validate*`, `auth*` are preserved in full.
- **CSS / SQL**: Retains `:root` tokens, layout properties, and DDL schemas while pruning bulk seed rows.

- **TypeScript / Python**: Function bodies are stubbed (`return null as any;` / `...`), preserving interfaces and type signatures.
- **Domain Logic**: Critical functions matching `is*`, `calc*`, `validate*`, `auth*` are preserved in full.
- **CSS / SQL**: Retains `:root` tokens, layout properties, and DDL schemas while pruning bulk seed rows.

---

## CLI Reference

```text
npx repomix-semantic-compressor [options]

  -f, --focus <pattern>            Target module path for 3-tier dependency slicing
  -o, --output <path>              Output file path (default: repomix-optimized.md)
  -i, --input <path>               Input Repomix file (auto-detects .xml/.json)
  -m, --max-preserve-lines <num>   Threshold to preserve short functions (default: 8)
  -e, --exact-tokens               Exact BPE cl100k_base token count (slower)
      --no-auto-pack               Disable automatic repomix execution
```

---

## Model Context Protocol (MCP) Integration

Add to your `claude_desktop_config.json` or Cursor/Windsurf MCP settings:

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

---

## License

MIT License (c) 2026 Sitrozyi
