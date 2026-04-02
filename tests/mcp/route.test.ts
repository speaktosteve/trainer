import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { McpInputError } from "$lib/mcp/validation";

vi.mock("$lib/mcp/handlers", () => ({
  listMcpTools: vi.fn(() => [
    {
      name: "get_plan",
      title: "Get Weekly Plan",
      description: "Retrieve a plan",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ]),
  executeMcpTool: vi.fn(),
}));

import { GET, POST } from "../../src/routes/data/mcp/+server";
import { executeMcpTool, listMcpTools } from "$lib/mcp/handlers";

async function parseResponse(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function readBodyText(response: Response): Promise<string> {
  return (await response.text()) ?? "";
}

describe("/data/mcp route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns MCP server capabilities and tools", async () => {
    const request = new Request("http://localhost/data/mcp");
    const response = await GET({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.result).toBeDefined();
    expect(listMcpTools).toHaveBeenCalledTimes(1);
  });

  it("GET supports SSE transport", async () => {
    const request = new Request("http://localhost/data/mcp?transport=sse", {
      headers: { accept: "text/event-stream" },
    });

    const response = await GET({ request, url: new URL(request.url) } as any);
    const body = await readBodyText(response);

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: ready");
    expect(body).toContain("event: tools");
  });

  it("POST returns parse error for invalid JSON", async () => {
    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      body: "{invalid",
      headers: { "content-type": "application/json" },
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(payload.error).toEqual({ code: -32700, message: "Invalid JSON" });
  });

  it("POST tools/list returns tools", async () => {
    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload.id).toBe(1);
    expect((payload.result as { tools: unknown[] }).tools).toHaveLength(1);
  });

  it("POST tools/call validates name", async () => {
    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {} }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(payload.error).toEqual({
      code: -32602,
      message: "Invalid params: tool name is required",
    });
  });

  it("POST tools/call executes tool and returns structured content", async () => {
    vi.mocked(executeMcpTool).mockResolvedValue({
      data: { weekStart: "2026-03-30", sessions: [] },
    });

    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_plan", arguments: { weekStart: "2026-03-30" } },
      }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload.id).toBe(3);
    expect((payload.result as { isError: boolean }).isError).toBe(false);
    expect(executeMcpTool).toHaveBeenCalledWith("get_plan", { weekStart: "2026-03-30" });
  });

  it("POST supports SSE response for tools/call", async () => {
    vi.mocked(executeMcpTool).mockResolvedValue({
      data: { weekStart: "2026-03-30", sessions: [] },
    });

    const request = new Request("http://localhost/data/mcp?transport=sse", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: { name: "get_plan", arguments: { weekStart: "2026-03-30" } },
      }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const body = await readBodyText(response);

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: result");
    expect(body).toContain('"id":30');
  });

  it("POST tools/call maps McpInputError to INVALID_PARAMS", async () => {
    vi.mocked(executeMcpTool).mockRejectedValue(new McpInputError("startDate must be an ISO date"));

    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_exercise_history", arguments: { startDate: "bad" } },
      }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(payload.error).toEqual({ code: -32602, message: "startDate must be an ISO date" });
  });

  it("POST tools/call maps internal errors", async () => {
    vi.mocked(executeMcpTool).mockRejectedValue(new Error("boom"));

    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_plan", arguments: {} },
      }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(500);
    expect(payload.error).toEqual({ code: -32000, message: "boom" });
  });

  it("POST returns method not found for unknown method", async () => {
    const request = new Request("http://localhost/data/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "ping" }),
    });

    const response = await POST({ request, url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(404);
    expect(payload.error).toEqual({ code: -32601, message: "Method not found: ping" });
  });
});
