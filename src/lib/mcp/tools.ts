export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "get_exercise_history",
    title: "Get Exercise History",
    description: "Retrieve completed exercise logs with optional date filtering and result limit.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "ISO date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "ISO date (YYYY-MM-DD)" },
        limit: { type: "number", minimum: 1, maximum: 500, default: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_bodyweight_history",
    title: "Get Bodyweight History",
    description: "Retrieve bodyweight entries with optional date filtering.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "ISO date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "ISO date (YYYY-MM-DD)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_plan",
    title: "Get Weekly Plan",
    description: "Retrieve the current week plan or a specific plan by week start date.",
    inputSchema: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "ISO date (YYYY-MM-DD), Monday" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_week_summary",
    title: "Get Weekly Summary",
    description: "Generate or retrieve a weekly training summary for a week.",
    inputSchema: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "ISO date (YYYY-MM-DD), Monday" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_goals",
    title: "Get Active Goals",
    description: "List all currently active goals with progress and target details.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_goal_progress",
    title: "Get Goal Progress",
    description: "Retrieve current progress, status, and target details for a specific goal.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Goal id" },
      },
      additionalProperties: false,
    },
  },
];
