# Repomix Semantic Compressor

[![npm version](https://img.shields.io/npm/v/repomix-semantic-compressor.svg)](https://www.npmjs.com/package/repomix-semantic-compressor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.3.0-informational.svg)](https://nodejs.org)

> AST-powered semantic post-processor for Repomix. Reduces LLM context token consumption by 60% - 80% while preserving complete schema integrity, types, and core logic.

Repomix Semantic Compressor parses packed repository outputs (JSON / XML) using Babel AST. It safely truncates non-essential implementation details while preserving type definitions, interfaces, short mathematical utilities, and state action signatures.

---

## Why Repomix Semantic Compressor?

Feeding full repositories into LLMs (Claude 3.5 Sonnet, GPT-4o, Gemini) often exceeds context limits or degrades reasoning performance due to verbose implementation noise.

- **Zero Syntax Errors**: AST-based transformation ensures TypeScript generics, JSX/TSX, and complex expressions remain syntactically valid.
- **Full Schema Integrity**: TypeScript interfaces, type aliases, classes, and parameter contracts are fully preserved.
- **Short Function Retention**: Utility functions and mathematical formulas (<= 8 lines) are retained to preserve business logic context.
- **Action & Protocol Extraction**: Automatically detects switch cases and event dispatchers, annotating action names and payload keys.
- **Asset & Layout Optimization**: Truncates base64 data, strips heavy SVG icon paths, and preserves essential CSS variables and grid/flex layout rules.

---

## Code Comparison

### Input (Raw Implementation)
```javascript
export interface PlayerState {
  id: string;
  hp: number;
  deck: Card[];
}

export function calculateDamage(base, multiplier) {
  return Math.max(0, base * multiplier);
}

export function handleGameAction(state, action) {
  switch (action.type) {
    case 'PLAY_CARD':
      const target = action.payload.targetId;
      const card = action.payload.cardId;
      // ... 150 lines of complex rendering & network emit logic ...
      break;
    case 'SURRENDER':
      // ... 40 lines of cleanup ...
      break;
  }
}
