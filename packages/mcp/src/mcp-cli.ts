#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { mcpServer } from "./mcp-server.js"

function disconnect(): void {
	mcpServer.close()
	process.exitCode = 0
}

await mcpServer.connect(new StdioServerTransport())

// Note: do not use stdout because it's used for the MCP transport.
console.error(`ViewLint MCP server is running. cwd: ${process.cwd()}`)

process.on("SIGINT", disconnect)
process.on("SIGTERM", disconnect)
