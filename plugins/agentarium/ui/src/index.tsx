import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Clock,
  Filter,
  Moon,
  Sun,
  Terminal,
  Bot,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Settings,
  Cpu,
  GitBranch,
  FileCode,
  Pencil,
  FileOutput,
  Search,
  Box,
  MessageSquare,
  Globe,
  FolderSearch,
  ListTodo,
  Play,
  Zap,
  Folder,
  Trash2,
  X,
  Check,
  StopCircle,
  type LucideIcon
} from "lucide-react";

// Types
interface Session {
  id: string;
  started_at: string;
  ended_at: string | null;
  project_root: string;
  model: string;
  git_branch: string | null;
}

interface Agent {
  id: string;
  session_id: string;
  parent_agent_id: string | null;
  agent_type: string;
  description: string;
  started_at: string;
  ended_at: string | null;
  status: string;
}

interface ToolUse {
  id: number;
  session_id: string;
  agent_id: string | null;
  tool_name: string;
  tool_input: string;
  tool_output: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  status: string;
}

interface TimelineItem {
  type: "tool" | "event";
  id: number;
  session_id: string;
  agent_id: string | null;
  name: string;
  timestamp: string;
  status: string | null;
  duration_ms: number | null;
  data: string;
}

interface Analytics {
  toolCounts: Array<{ tool_name: string; count: number; avg_duration: number }>;
  statusCounts: Array<{ status: string; count: number }>;
  agentCounts: Array<{ agent_type: string; count: number }>;
  hourlyActivity: Array<{ hour: string; count: number }>;
}

// API functions
const API_BASE = "";

async function fetchApi<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  return res.json();
}

async function deleteApi(endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Multi-select dropdown component with checkboxes
interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  placeholder?: string;
  className?: string;
  showGroups?: boolean;
}

function MultiSelect({ options, selected, onChange, placeholder = "Select...", className = "", showGroups = false }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(options.map(o => o.value)));
  const clearAll = () => onChange(new Set());

  const displayText = selected.size === 0
    ? placeholder
    : selected.size === 1
    ? options.find(o => o.value === [...selected][0])?.label || [...selected][0]
    : `${selected.size} selected`;

  // Group options if showGroups is true
  const groupedOptions = showGroups
    ? options.reduce((acc, opt) => {
        const group = opt.group || "Other";
        if (!acc[group]) acc[group] = [];
        acc[group].push(opt);
        return acc;
      }, {} as Record<string, MultiSelectOption[]>)
    : { "": options };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 text-sm min-w-[140px] w-full"
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-2 flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              Select all
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          {Object.entries(groupedOptions).map(([group, opts]) => (
            <div key={group}>
              {showGroups && group && (
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                  {group}
                </div>
              )}
              {opts.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selected.has(opt.value)
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}>
                    {selected.has(opt.value) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm truncate">{opt.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon mapping for tools and events
const toolIconMap: Record<string, { icon: LucideIcon; color: string }> = {
  // File operations
  Read: { icon: FileCode, color: "text-green-500" },
  Write: { icon: FileOutput, color: "text-blue-500" },
  Edit: { icon: Pencil, color: "text-yellow-500" },
  // Search operations
  Grep: { icon: Search, color: "text-purple-500" },
  Glob: { icon: FolderSearch, color: "text-purple-400" },
  // Shell/execution
  Bash: { icon: Terminal, color: "text-orange-500" },
  // Task/Agent
  Task: { icon: Box, color: "text-cyan-500" },
  // User interaction
  AskUserQuestion: { icon: MessageSquare, color: "text-pink-500" },
  // Web operations
  WebFetch: { icon: Globe, color: "text-indigo-500" },
  WebSearch: { icon: Globe, color: "text-indigo-400" },
  // Notebook
  NotebookEdit: { icon: FileCode, color: "text-amber-500" },
  // Todo
  TodoWrite: { icon: ListTodo, color: "text-teal-500" },
  // Skill
  Skill: { icon: Zap, color: "text-violet-500" },
  // MCP tools (start with mcp__)
  mcp: { icon: Box, color: "text-emerald-500" },
};

const eventIconMap: Record<string, { icon: LucideIcon; color: string }> = {
  SessionStart: { icon: Play, color: "text-green-500" },
  SessionEnd: { icon: XCircle, color: "text-red-500" },
  AgentStart: { icon: Cpu, color: "text-blue-500" },
  AgentStop: { icon: CheckCircle, color: "text-green-500" },
  SubagentStop: { icon: CheckCircle, color: "text-cyan-500" },
};

function getItemIcon(type: "tool" | "event", name: string): { icon: LucideIcon; color: string } {
  if (type === "event") {
    return eventIconMap[name] || { icon: Activity, color: "text-gray-500" };
  }

  // Check for exact match first
  if (toolIconMap[name]) {
    return toolIconMap[name];
  }

  // Check for MCP tools (start with mcp__)
  if (name.startsWith("mcp__")) {
    return toolIconMap.mcp;
  }

  // Default
  return { icon: Terminal, color: "text-gray-500" };
}

// Components
function StatusBadge({ status }: { status: string }) {
  const config = {
    success: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    error: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
    pending: { icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    running: { icon: RefreshCw, color: "text-blue-500", bg: "bg-blue-500/10" },
    completed: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    interrupted: { icon: StopCircle, color: "text-orange-500", bg: "bg-orange-500/10" }
  }[status] || { icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-500/10" };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.color} ${config.bg}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function TimelineView({ sessionIds }: { sessionIds: Set<string> }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [filters, setFilters] = useState({
    searchText: "",
    selectedTools: new Set<string>(),
    selectedEvents: new Set<string>()
  });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Serialize sessionIds for dependency tracking
  const sessionIdsKey = [...sessionIds].sort().join(",");

  useEffect(() => {
    setLoading(true);
    // Fetch all items, filter client-side if sessions are selected
    fetchApi<TimelineItem[]>("/api/timeline", {})
      .then(data => {
        if (sessionIds.size > 0) {
          setItems(data.filter(item => sessionIds.has(item.session_id)));
        } else {
          setItems(data);
        }
      })
      .finally(() => setLoading(false));
  }, [sessionIdsKey]);

  // Get unique tool names and event types for filter dropdowns
  const toolNames = [...new Set(items.filter(i => i.type === "tool").map(i => i.name))].sort();
  const eventTypes = [...new Set(items.filter(i => i.type === "event").map(i => i.name))].sort();

  const filtered = items.filter((item) => {
    // Text search (searches name and data)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const nameMatch = item.name.toLowerCase().includes(searchLower);
      const dataMatch = item.data?.toLowerCase().includes(searchLower);
      if (!nameMatch && !dataMatch) {
        return false;
      }
    }
    // Tool filter (if any selected, only show those)
    if (filters.selectedTools.size > 0 && item.type === "tool") {
      if (!filters.selectedTools.has(item.name)) {
        return false;
      }
    }
    // Event filter (if any selected, only show those)
    if (filters.selectedEvents.size > 0 && item.type === "event") {
      if (!filters.selectedEvents.has(item.name)) {
        return false;
      }
    }
    // If tools are selected but not events, hide events (and vice versa)
    if (filters.selectedTools.size > 0 && filters.selectedEvents.size === 0 && item.type === "event") {
      return false;
    }
    if (filters.selectedEvents.size > 0 && filters.selectedTools.size === 0 && item.type === "tool") {
      return false;
    }
    return true;
  });

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Activity className="w-12 h-12 mb-4 opacity-50" />
        <p>No activity recorded yet</p>
        <p className="text-sm mt-2">Tool uses and events will appear here once tracking is active</p>
      </div>
    );
  }

  const toolOptions: MultiSelectOption[] = toolNames.map(name => ({ value: name, label: name }));
  const eventOptions: MultiSelectOption[] = eventTypes.map(name => ({ value: name, label: name }));

  const hasFilters = filters.searchText || filters.selectedTools.size > 0 || filters.selectedEvents.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded px-3 py-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search..."
            value={filters.searchText}
            onChange={(e) => setFilters((f) => ({ ...f, searchText: e.target.value }))}
            className="bg-transparent border-none outline-none text-sm w-32 text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
        {toolNames.length > 0 && (
          <MultiSelect
            options={toolOptions}
            selected={filters.selectedTools}
            onChange={(selected) => setFilters((f) => ({ ...f, selectedTools: selected }))}
            placeholder="All tools"
          />
        )}
        {eventTypes.length > 0 && (
          <MultiSelect
            options={eventOptions}
            selected={filters.selectedEvents}
            onChange={(selected) => setFilters((f) => ({ ...f, selectedEvents: selected }))}
            placeholder="All events"
          />
        )}
        <span className="text-sm text-gray-500">{filtered.length} items</span>
        {hasFilters && (
          <button
            onClick={() => setFilters({ searchText: "", selectedTools: new Set(), selectedEvents: new Set() })}
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="border dark:border-gray-700 rounded-lg overflow-hidden"
          >
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => toggle(item.id)}
            >
              {expanded.has(item.id) ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <span className={`px-2 py-0.5 rounded text-xs ${item.type === "tool" ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"}`}>
                {item.type}
              </span>
              {(() => {
                const { icon: Icon, color } = getItemIcon(item.type, item.name);
                return <Icon className={`w-4 h-4 ${color}`} />;
              })()}
              <span className="font-mono text-sm">{item.name}</span>
              {item.status && <StatusBadge status={item.status} />}
              {item.duration_ms && (
                <span className="text-xs text-gray-500 ml-auto">
                  {item.duration_ms.toFixed(0)}ms
                </span>
              )}
              <span className="text-xs text-gray-400">
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {expanded.has(item.id) && item.data && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border-t dark:border-gray-700">
                <pre className="text-xs overflow-auto max-h-64 font-mono">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(item.data), null, 2);
                    } catch {
                      return item.data;
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsDashboard({ sessionIds }: { sessionIds: Set<string> }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Serialize sessionIds for dependency tracking
  const sessionIdsKey = [...sessionIds].sort().join(",");

  useEffect(() => {
    setLoading(true);
    // For analytics, use first selected session or all if none selected
    const sessionId = sessionIds.size === 1 ? [...sessionIds][0] : "";
    fetchApi<Analytics>("/api/analytics", { session_id: sessionId })
      .then(setAnalytics)
      .finally(() => setLoading(false));
  }, [sessionIdsKey]);

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalTools = analytics.toolCounts.reduce((sum, t) => sum + t.count, 0);

  if (totalTools === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
        <p>No analytics data yet</p>
        <p className="text-sm mt-2">Statistics will appear here once tool uses are recorded</p>
      </div>
    );
  }
  const successCount = analytics.statusCounts.find((s) => s.status === "success")?.count || 0;
  const errorCount = analytics.statusCounts.find((s) => s.status === "error")?.count || 0;
  const successRate = totalTools > 0 ? ((successCount / totalTools) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <Terminal className="w-4 h-4" />
            Total Tool Uses
          </div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">{totalTools}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <CheckCircle className="w-4 h-4" />
            Success Rate
          </div>
          <div className="text-2xl font-semibold text-green-500">{successRate}%</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <XCircle className="w-4 h-4" />
            Errors
          </div>
          <div className="text-2xl font-semibold text-red-500">{errorCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <Cpu className="w-4 h-4" />
            Agent Types
          </div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">{analytics.agentCounts.length}</div>
        </div>
      </div>

      {/* Tool Usage Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
          <BarChart3 className="w-5 h-5" />
          Tool Usage
        </h3>
        <div className="space-y-2">
          {analytics.toolCounts.slice(0, 10).map((tool) => {
            const pct = totalTools > 0 ? (tool.count / totalTools) * 100 : 0;
            return (
              <div key={tool.tool_name} className="flex items-center gap-3">
                <span className="w-32 text-sm font-mono truncate text-gray-900 dark:text-gray-100">{tool.tool_name}</span>
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-right text-gray-900 dark:text-gray-100">{tool.count}</span>
                <span className="w-20 text-xs text-gray-500 dark:text-gray-400">
                  avg {tool.avg_duration?.toFixed(0) || 0}ms
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Types */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <GitBranch className="w-5 h-5" />
            Agent Types
          </h3>
          <div className="space-y-2">
            {analytics.agentCounts.map((agent) => (
              <div key={agent.agent_type} className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{agent.agent_type || "main"}</span>
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm text-gray-900 dark:text-gray-100">
                  {agent.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Clock className="w-5 h-5" />
            Recent Activity
          </h3>
          <div className="space-y-2">
            {analytics.hourlyActivity.slice(0, 8).map((hour) => (
              <div key={hour.hour} className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{hour.hour}</span>
                <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-sm">
                  {hour.count} ops
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentsView({ sessionIds }: { sessionIds: Set<string> }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Serialize sessionIds for dependency tracking
  const sessionIdsKey = [...sessionIds].sort().join(",");

  useEffect(() => {
    setLoading(true);
    // Fetch all agents, filter client-side if sessions are selected
    fetchApi<Agent[]>("/api/agents", {})
      .then(data => {
        if (sessionIds.size > 0) {
          setAgents(data.filter(agent => sessionIds.has(agent.session_id)));
        } else {
          setAgents(data);
        }
      })
      .finally(() => setLoading(false));
  }, [sessionIdsKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // Build tree structure
  const rootAgents = agents.filter(a => !a.parent_agent_id);
  const childrenMap = new Map<string, Agent[]>();
  agents.forEach(a => {
    if (a.parent_agent_id) {
      const children = childrenMap.get(a.parent_agent_id) || [];
      children.push(a);
      childrenMap.set(a.parent_agent_id, children);
    }
  });

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const renderAgent = (agent: Agent, depth: number = 0): React.ReactNode => {
    const children = childrenMap.get(agent.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(agent.id);

    return (
      <div key={agent.id} className="select-none">
        <div
          className={`flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer`}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
          onClick={() => hasChildren && toggle(agent.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <span className="w-4" />
          )}
          <Cpu className="w-4 h-4 text-blue-500" />
          <span className="font-mono text-sm">{agent.agent_type || "main"}</span>
          <StatusBadge status={agent.status} />
          {agent.description && (
            <span className="text-xs text-gray-500 truncate max-w-xs">
              {agent.description}
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {new Date(agent.started_at).toLocaleTimeString()}
          </span>
        </div>
        {isExpanded && children.map(child => renderAgent(child, depth + 1))}
      </div>
    );
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <GitBranch className="w-12 h-12 mb-4 opacity-50" />
        <p>No agent activity recorded yet</p>
        <p className="text-sm mt-2">Agents will appear here once tracking is active</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{agents.length} agents</span>
        <span className="text-sm text-gray-500">
          {rootAgents.length} root, {agents.length - rootAgents.length} subagents
        </span>
      </div>
      <div className="border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-700">
        {rootAgents.map(agent => renderAgent(agent))}
      </div>
    </div>
  );
}

function SessionManager({
  sessions,
  selectedSessions,
  onSelectSessions,
  onSessionsDeleted
}: {
  sessions: Session[];
  selectedSessions: Set<string>;
  onSelectSessions: (ids: Set<string>) => void;
  onSessionsDeleted: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Deduplicate sessions by ID
  const uniqueSessions = sessions.filter(
    (session, index, self) => index === self.findIndex(s => s.id === session.id)
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSession = (id: string) => {
    const next = new Set(selectedSessions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectSessions(next);
  };

  const selectAll = () => onSelectSessions(new Set(uniqueSessions.map(s => s.id)));
  const clearAll = () => onSelectSessions(new Set());

  const handleDelete = async () => {
    if (selectedSessions.size === 0) return;
    if (!confirm(`Delete ${selectedSessions.size} session(s)? This will remove all associated data.`)) return;

    setIsDeleting(true);
    try {
      await deleteApi("/api/sessions", { ids: [...selectedSessions] });
      onSelectSessions(new Set());
      onSessionsDeleted();
    } finally {
      setIsDeleting(false);
    }
  };

  const displayText = selectedSessions.size === 0
    ? "All Sessions"
    : selectedSessions.size === 1
    ? (() => {
        const s = uniqueSessions.find(s => s.id === [...selectedSessions][0]);
        return s ? `${new Date(s.started_at).toLocaleDateString()} - ${s.id.slice(0, 8)}` : "1 session";
      })()
    : `${selectedSessions.size} sessions`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 text-sm min-w-[180px]"
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-80 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg">
          {/* Header with actions */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-2 flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-500 hover:text-blue-600">
                Select all
              </button>
              <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-600">
                Clear
              </button>
            </div>
            {selectedSessions.size > 0 && (
              <span className="text-xs text-gray-500">{selectedSessions.size} selected</span>
            )}
          </div>

          {/* Session list */}
          <div className="max-h-64 overflow-auto">
            {uniqueSessions.map((s) => (
              <div
                key={s.id}
                onClick={() => toggleSession(s.id)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  selectedSessions.has(s.id)
                    ? "bg-blue-500 border-blue-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}>
                  {selectedSessions.has(s.id) && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate text-gray-900 dark:text-gray-100">
                    {new Date(s.started_at).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.id.slice(0, 8)}{s.git_branch ? ` • ${s.git_branch}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Delete footer */}
          {selectedSessions.size > 0 && (
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 p-2">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-400 text-white rounded text-sm"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? "Deleting..." : `Delete ${selectedSessions.size} session(s)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectStatus {
  initialized: boolean;
  needs_restart: boolean;
  auto_open_dashboard: boolean;
  dashboard_port: number;
  project_root: string;
  project_name: string;
}

function App() {
  // Always use light mode for now
  const darkMode = false;
  const [tab, setTab] = useState<"timeline" | "agents" | "analytics">("timeline");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null);

  // Fetch project status on mount
  useEffect(() => {
    fetchApi<ProjectStatus>("/api/project-status").then(setProjectStatus);
  }, []);

  // Re-check project status periodically to clear banner when hooks start working
  useEffect(() => {
    if (!projectStatus?.needs_restart) return;
    const interval = setInterval(() => {
      fetchApi<ProjectStatus>("/api/project-status").then(setProjectStatus);
    }, 5000);
    return () => clearInterval(interval);
  }, [projectStatus?.needs_restart]);

  useEffect(() => {
    fetchApi<Array<{ git_branch: string }>>("/api/branches").then(data => {
      setBranches(data.map(b => b.git_branch));
    });
  }, []);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedBranch) params.git_branch = selectedBranch;
    fetchApi<Session[]>("/api/sessions", params).then(setSessions);
  }, [refreshKey, selectedBranch]);

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div className={`min-h-screen ${darkMode ? "dark bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      {/* Restart Banner */}
      {projectStatus?.needs_restart && (
        <div className="bg-amber-500 text-amber-950 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">
              Agentarium was just initialized. Please restart Claude Code for tracking to begin.
            </span>
          </div>
          <p className="text-sm mt-1 opacity-80">
            Close this terminal and run <code className="bg-amber-600/30 px-1 rounded">claude</code> again in your project directory.
          </p>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-blue-500" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Agentarium</h1>
              {projectStatus?.project_name && (
                <div
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                  title={projectStatus.project_root}
                >
                  <Folder className="w-3 h-3" />
                  <span>{projectStatus.project_name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {branches.length > 0 && (
              <select
                value={selectedBranch || ""}
                onChange={(e) => {
                  setSelectedBranch(e.target.value || undefined);
                  setSelectedSessions(new Set());
                }}
                className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 text-sm border-none"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            <SessionManager
              sessions={sessions}
              selectedSessions={selectedSessions}
              onSelectSessions={setSelectedSessions}
              onSessionsDeleted={() => setRefreshKey(k => k + 1)}
            />
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 ${autoRefresh ? "text-green-500" : ""}`}
              title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            >
              <RefreshCw className={`w-5 h-5 ${autoRefresh ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            <button
              onClick={() => setTab("timeline")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === "timeline"
                  ? "border-blue-500 text-blue-500"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Activity className="w-4 h-4" />
              Timeline
            </button>
            <button
              onClick={() => setTab("agents")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === "agents"
                  ? "border-blue-500 text-blue-500"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <GitBranch className="w-4 h-4" />
              Agents
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                tab === "analytics"
                  ? "border-blue-500 text-blue-500"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "timeline" && <TimelineView sessionIds={selectedSessions} />}
        {tab === "agents" && <AgentsView sessionIds={selectedSessions} />}
        {tab === "analytics" && <AnalyticsDashboard sessionIds={selectedSessions} />}
      </main>
    </div>
  );
}

// Mount
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
