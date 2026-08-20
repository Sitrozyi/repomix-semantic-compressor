#!/usr/bin/env node

import { main } from '../src/core.mjs';
import { startMCPServer } from '../src/mcp.mjs';

if (process.argv.includes('--mcp')) {
  startMCPServer().catch((err) => {
    console.error(`MCP server fatal error: ${err.message}`);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(`fatal error: ${err.message}`);
    process.exit(1);
  });
}
