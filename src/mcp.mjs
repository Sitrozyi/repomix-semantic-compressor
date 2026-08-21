import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { extractFiles, compressRepository, findDefaultInputFile } from './core.mjs';

/**
 * Creates and configures the Repomix Compressor MCP Server instance.
 * @returns {Server}
 */
export function createMCPServer() {
  const server = new Server(
    {
      name: 'repomix-semantic-compressor',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_repo_skeleton',
          description: 'Retrieve the compressed semantic skeleton of the repository. Optionally pass a focus path to retain full implementation for relevant modules.',
          inputSchema: {
            type: 'object',
            properties: {
              focus: {
                type: 'string',
                description: 'Path pattern or module name to retain full implementation (e.g. "src/auth")'
              },
              input: {
                type: 'string',
                description: 'Path to repomix output file (auto-detected if omitted)'
              },
              maxPreserveLines: {
                type: 'number',
                description: 'Max lines to preserve full function bodies (default: 8)'
              }
            }
          }
        },
        {
          name: 'get_file_implementation',
          description: 'Retrieve the uncompressed source code for a specific file from the repository artifact.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to retrieve'
              },
              input: {
                type: 'string',
                description: 'Path to repomix output file (auto-detected if omitted)'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'compress_repomix_file',
          description: 'Compress a repomix file and write the result to a specified output path.',
          inputSchema: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description: 'Input repomix file path'
              },
              output: {
                type: 'string',
                description: 'Output optimized markdown path (default: repomix-optimized.md)'
              },
              focus: {
                type: 'string',
                description: 'Focus pattern for targeted full retention'
              },
              maxPreserveLines: {
                type: 'number',
                description: 'Max lines to preserve full function bodies (default: 8)'
              }
            }
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      if (name === 'get_repo_skeleton') {
        const inputFile = args.input || findDefaultInputFile();
        if (!fs.existsSync(inputFile)) {
          return {
            content: [{ type: 'text', text: `Error: Repomix file not found: ${inputFile}` }],
            isError: true
          };
        }
        const rawContent = fs.readFileSync(inputFile, 'utf-8');
        const files = extractFiles(rawContent, inputFile);
        const skeleton = await compressRepository(files, {
          focus: args.focus || null,
          maxPreserveLines: args.maxPreserveLines || 8
        });
        return {
          content: [{ type: 'text', text: skeleton }]
        };
      }

      if (name === 'get_file_implementation') {
        const inputFile = args.input || findDefaultInputFile();
        if (!fs.existsSync(inputFile)) {
          return {
            content: [{ type: 'text', text: `Error: Repomix file not found: ${inputFile}` }],
            isError: true
          };
        }
        const rawContent = fs.readFileSync(inputFile, 'utf-8');
        const files = extractFiles(rawContent, inputFile);
        const targetPath = args.path;
        const matched = files.find((f) => f.path === targetPath || f.path.endsWith(targetPath) || f.path.includes(targetPath));

        if (!matched) {
          return {
            content: [{ type: 'text', text: `Error: File '${targetPath}' not found in repository artifact.` }],
            isError: true
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `### File: ${matched.path}\n\`\`\`\`\n${matched.content}\n\`\`\`\``
            }
          ]
        };
      }

      if (name === 'compress_repomix_file') {
        const inputFile = args.input || findDefaultInputFile();
        const outputFile = args.output || 'repomix-optimized.md';
        if (!fs.existsSync(inputFile)) {
          return {
            content: [{ type: 'text', text: `Error: Repomix file not found: ${inputFile}` }],
            isError: true
          };
        }
        const rawContent = fs.readFileSync(inputFile, 'utf-8');
        const files = extractFiles(rawContent, inputFile);
        const result = await compressRepository(files, {
          focus: args.focus || null,
          maxPreserveLines: args.maxPreserveLines || 8
        });
        fs.writeFileSync(outputFile, result, 'utf-8');
        return {
          content: [
            {
              type: 'text',
              text: `Successfully compressed ${files.length} files to ${outputFile}`
            }
          ]
        };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Tool execution failed: ${err.message}` }],
        isError: true
      };
    }
  });

  return server;
}

export async function startMCPServer() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Repomix Semantic Compressor MCP Server running on stdio');
}
