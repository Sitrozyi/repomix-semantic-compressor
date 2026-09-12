#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../bin/cli.mjs');
const CACHE_DIR = path.join(__dirname, '.cache');

const DEFAULT_REPOS = [
  { name: 'sindresorhus/ky', url: 'https://github.com/sindresorhus/ky.git' },
  { name: 'honojs/hono', url: 'https://github.com/honojs/hono.git' },
  { name: 'tailwindlabs/tailwindcss', url: 'https://github.com/tailwindlabs/tailwindcss.git' }
];

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'pipe' });
}

function estimateTokensFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  return Math.round(Buffer.byteLength(text, 'utf-8') / 3.8);
}

function benchmarkRepo(repo) {
  const repoDir = path.join(CACHE_DIR, repo.name.replace('/', '__'));
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Cloning ${repo.name}...`);
    run(`git clone --depth 1 "${repo.url}" "${repoDir}"`, CACHE_DIR);
  } else {
    console.log(`Using cached ${repo.name}`);
  }

  console.log(`Packing ${repo.name} with repomix...`);
  run('npx --yes repomix', repoDir);

  const inputXml = path.join(repoDir, 'repomix-output.xml');
  if (!fs.existsSync(inputXml)) {
    throw new Error(`repomix did not produce an artifact for ${repo.name}`);
  }

  const outputMd = path.join(repoDir, 'repomix-optimized.md');
  console.log(`Compressing ${repo.name}...`);
  run(`node "${CLI}" -i "${inputXml}" -o "${outputMd}" --no-auto-pack`, repoDir);

  const inputBytes = fs.statSync(inputXml).size;
  const outputBytes = fs.statSync(outputMd).size;
  const inputTokens = estimateTokensFromFile(inputXml);
  const outputTokens = estimateTokensFromFile(outputMd);
  const reduction = (((inputTokens - outputTokens) / inputTokens) * 100).toFixed(1);

  return {
    name: repo.name,
    inputKB: (inputBytes / 1024).toFixed(0),
    outputKB: (outputBytes / 1024).toFixed(0),
    inputTokens,
    outputTokens,
    reduction
  };
}

function main() {
  const args = process.argv.slice(2);
  const repos = args.length > 0
    ? args.map((url) => {
        const name = url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        return { name, url };
      })
    : DEFAULT_REPOS;

  const results = [];
  for (const repo of repos) {
    try {
      results.push(benchmarkRepo(repo));
    } catch (err) {
      console.error(`Failed: ${repo.name} — ${err.message}`);
    }
  }

  console.log('\n## Benchmark Results\n');
  console.log('| Repository | Size (before) | Size (after) | Tokens (before) | Tokens (after) | Reduction |');
  console.log('| :--- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of results) {
    console.log(
      `| \`${r.name}\` | ${r.inputKB} kB | ${r.outputKB} kB | ${r.inputTokens.toLocaleString()} | ${r.outputTokens.toLocaleString()} | -${r.reduction}% |`
    );
  }
  console.log('\nToken counts use the fast byte-length approximation (bytes / 3.8).');
  console.log('For exact BPE counts, add `--exact-tokens` to the CLI invocation.');
}

main();
