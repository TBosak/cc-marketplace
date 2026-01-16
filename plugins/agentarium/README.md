# Agentarium

Track, display, filter, and analyze Claude Code agent activity.

## Features

- **Agent Activity Tracking**: Automatically tracks all tool uses, agents, and subagents via Claude Code hooks
- **SQLite Database**: Persistent storage of all activity data
- **MCP Server**: Query agent activity programmatically from Claude Code
- **Web Dashboard**: React-based UI with filterable timeline and analytics

## Usage

### Installation
1. Install Bun: https://bun.sh/
2. In Claude Code, enter "/plugin marketplace add TBosak/cc-marketplace" to add the marketplace plugin.
3. Then enter "/plugin install agentarium@tbosak" to install Agentarium.
4. Install tracking hooks and initialize database by starting a session with the plugin enabled.
5. Restart Claude Code to ensure hooks are active and that dashboard is accessible.

### Dashboard

Start the web dashboard:

```bash
bun run dashboard
```

Or run the dev server:

```bash
bun run dev
```

### Quick Stats

View statistics in terminal:

```bash
bun run stats
```

## Architecture

```
agentarium/
├── hooks/           # Claude Code hooks for tracking
│   ├── pre-tool.ts      # Tracks tool use starts
│   ├── post-tool.ts     # Tracks tool use completions
│   ├── session-start.ts # Tracks session starts
│   ├── session-end.ts   # Tracks session ends
│   ├── stop.ts          # Tracks turn completions
│   └── subagent-stop.ts # Tracks subagent completions
├── lib/             # Shared libraries
│   ├── database.ts      # SQLite database operations
│   └── context.ts       # Runtime context management
├── mcp/             # MCP server
│   └── server.ts        # MCP tools for querying data
├── ui/              # React dashboard
│   ├── server.ts        # Hono server
│   └── src/
│       └── index.tsx    # Dashboard UI
├── commands/        # CLI commands
│   ├── open-dashboard.ts
│   └── show-stats.ts
└── plugin.json      # Claude Code plugin manifest
```

## MCP Tools

### Hook Management
- `agentarium_install_tracking` - Install all tracking hooks to project settings
- `agentarium_uninstall_tracking` - Remove Agentarium hooks from project
- `agentarium_check_tracking` - Check if tracking is installed
- `agentarium_list_project_hooks` - List all hooks in project settings

### Data Queries
- `agentarium_get_sessions` - List tracked sessions
- `agentarium_get_agents` - Get agents/subagents
- `agentarium_get_tool_uses` - Query tool usage with filters
- `agentarium_get_events` - Get tracked events
- `agentarium_get_analytics` - Get usage statistics
- `agentarium_get_timeline` - Unified timeline view
- `agentarium_query_db` - Custom SQL queries (read-only)

## Database Schema

The SQLite database stores:
- **sessions**: Claude Code sessions
- **agents**: Agents and subagents with parent relationships
- **tool_uses**: All tool invocations with timing and results
- **events**: Custom events (agent start/stop, etc.)

## License

MIT
