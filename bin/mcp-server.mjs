#!/usr/bin/env node

import { startMCPServer } from '../src/mcp.mjs';

startMCPServer().catch((err) => {
  console.error(`MCP Server fatal error: ${err.message}`);
  process.exit(1);
});
