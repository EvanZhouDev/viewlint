# @viewlint/mcp

`@viewlint/mcp` is the Model Context Protocol (MCP) server for ViewLint.

It lets MCP-capable editors and agents run ViewLint as tools, so they can get feedback from rendered UI while making changes.

## Usage

```bash
npx @viewlint/mcp@latest
```

Or:

```bash
viewlint --mcp
```

## What it does

- Runs a stdio MCP server
- Discovers the active `viewlint.config.*` file from the current working directory
- Exposes a `get-config` tool to inspect configuration discovery
- Exposes a `lint` tool to run ViewLint with optional `view`, `options`, `scopes`, and `selectors`
- Returns structured lint results suitable for agent workflows

## Example MCP client config

```json
{
  "servers": {
    "viewlint": {
      "type": "stdio",
      "command": "npx",
      "args": ["@viewlint/mcp@latest"]
    }
  }
}
```

See the [MCP Server docs](https://viewlint.vercel.app/docs/mcp-server) in the ViewLint Documentation for full setup details.
