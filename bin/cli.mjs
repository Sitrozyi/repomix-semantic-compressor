#!/usr/bin/env node

import { main } from '../src/core.mjs';

main().catch((err) => {
  console.error(`fatal error: ${err.message}`);
  process.exit(1);
});
