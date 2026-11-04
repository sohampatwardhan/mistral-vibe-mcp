#!/usr/bin/env node
/**
 * mistral-vibe-mcp — MCP stdio server wrapping the Mistral Vibe CLI.
 * Clean-room implementation, MIT licensed.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefinitions, callTool } from "./tools.js";

const server = new Server(
  { name: "mistral-vibe-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;
  const result = await callTool(name, args);
  return result as CallToolResult;
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only; stdout is the MCP channel.
  process.stderr.write("mistral-vibe-mcp: listening on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`mistral-vibe-mcp: fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
