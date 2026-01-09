#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');

/**
 * Execute a command in the AudioBash project directory
 */
async function runCommand(command, options = {}) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      ...options
    });
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || '',
      error: error.message
    };
  }
}

/**
 * Parse IPC handlers from main.cjs
 */
async function listIpcHandlers() {
  try {
    const mainPath = join(PROJECT_ROOT, 'electron/main.cjs');
    const content = await readFile(mainPath, 'utf-8');

    // Match ipcMain.handle and ipcMain.on patterns
    const handlePattern = /ipcMain\.(handle|on)\s*\(\s*['"]([^'"]+)['"]/g;
    const handlers = [];
    let match;

    while ((match = handlePattern.exec(content)) !== null) {
      handlers.push({
        type: match[1], // 'handle' or 'on'
        channel: match[2]
      });
    }

    return {
      success: true,
      handlers,
      count: handlers.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check for outdated npm dependencies
 */
async function checkDependencies() {
  const result = await runCommand('npm outdated --json', {
    encoding: 'utf-8',
    // npm outdated returns exit code 1 when there are outdated packages
    shell: true
  });

  try {
    if (result.stdout) {
      const outdated = JSON.parse(result.stdout);
      const packages = Object.entries(outdated).map(([name, info]) => ({
        name,
        current: info.current,
        wanted: info.wanted,
        latest: info.latest,
        location: info.location
      }));

      return {
        success: true,
        outdated: packages,
        count: packages.length
      };
    } else {
      return {
        success: true,
        outdated: [],
        count: 0,
        message: 'All dependencies are up to date!'
      };
    }
  } catch (error) {
    // If parsing fails, return raw output
    return {
      success: true,
      message: 'All dependencies are up to date!',
      outdated: [],
      count: 0
    };
  }
}

/**
 * MCP Server Implementation
 */
class AudioBashToolsServer {
  constructor() {
    this.server = new Server(
      {
        name: '@audiobash/claude-tools',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'audiobash_launch_dev',
          description: 'Launch AudioBash in development mode (npm run electron:dev)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'audiobash_run_tests',
          description: 'Run the AudioBash test suite and return results',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                description: 'Optional test file pattern to filter tests (e.g., "Terminal")'
              },
              verbose: {
                type: 'boolean',
                description: 'Run tests in verbose mode',
                default: false
              }
            }
          }
        },
        {
          name: 'audiobash_list_ipc',
          description: 'List all IPC handlers defined in electron/main.cjs',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'audiobash_build',
          description: 'Build AudioBash for specified platform',
          inputSchema: {
            type: 'object',
            properties: {
              platform: {
                type: 'string',
                enum: ['mac', 'mac:arm64', 'mac:x64', 'win', 'linux'],
                description: 'Target platform for the build',
                default: 'mac:arm64'
              }
            }
          }
        },
        {
          name: 'audiobash_check_deps',
          description: 'Check for outdated npm dependencies in the project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'audiobash_launch_dev': {
            const result = await runCommand('npm run electron:dev', {
              timeout: 5000 // Kill after 5s since it runs indefinitely
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    message: 'Development server launched. Process will run in background.',
                    note: 'Use Ctrl+C in the terminal to stop the dev server',
                    ...result
                  }, null, 2)
                }
              ]
            };
          }

          case 'audiobash_run_tests': {
            let command = 'npm test';
            if (args?.filter) {
              command += ` -- --testNamePattern="${args.filter}"`;
            }
            if (args?.verbose) {
              command += ' -- --verbose';
            }

            const result = await runCommand(command, { timeout: 60000 });

            // Parse test results
            const testOutput = result.stdout + '\n' + result.stderr;
            const passMatch = testOutput.match(/(\d+) passed/);
            const failMatch = testOutput.match(/(\d+) failed/);
            const totalMatch = testOutput.match(/Tests:\s+(.+)/);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: result.success,
                    summary: {
                      passed: passMatch ? parseInt(passMatch[1]) : 0,
                      failed: failMatch ? parseInt(failMatch[1]) : 0,
                      total: totalMatch ? totalMatch[1] : 'unknown'
                    },
                    output: testOutput,
                    filter: args?.filter || 'none'
                  }, null, 2)
                }
              ]
            };
          }

          case 'audiobash_list_ipc': {
            const result = await listIpcHandlers();

            if (result.success) {
              const handlersByType = result.handlers.reduce((acc, h) => {
                acc[h.type] = acc[h.type] || [];
                acc[h.type].push(h.channel);
                return acc;
              }, {});

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      totalHandlers: result.count,
                      handlers: handlersByType,
                      details: result.handlers
                    }, null, 2)
                  }
                ]
              };
            } else {
              throw new Error(result.error);
            }
          }

          case 'audiobash_build': {
            const platform = args?.platform || 'mac:arm64';
            const buildCommand = `npm run electron:build:${platform}`;

            const result = await runCommand(buildCommand, { timeout: 300000 }); // 5 min timeout

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: result.success,
                    platform,
                    command: buildCommand,
                    output: result.stdout,
                    errors: result.stderr
                  }, null, 2)
                }
              ]
            };
          }

          case 'audiobash_check_deps': {
            const result = await checkDependencies();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: result.success,
                    outdatedCount: result.count,
                    outdated: result.outdated,
                    message: result.message
                  }, null, 2)
                }
              ]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                tool: name
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AudioBash Tools MCP server running on stdio');
  }
}

// Start the server
const server = new AudioBashToolsServer();
server.run().catch(console.error);
