import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { executeMcpTool, listMcpTools } from "$lib/mcp/handlers";
import { McpInputError } from "$lib/mcp/validation";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
    protocolVersion?: string;
    capabilities?: unknown;
    clientInfo?: unknown;
  };
}

type RpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

type RpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string };
};

function makeRpcError(id: RpcRequest["id"], code: number, message: string, status = 400) {
  return json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    },
    { status },
  );
}

function makeRpcErrorPayload(id: RpcRequest["id"], code: number, message: string): RpcError {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

function sseMessage(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function isSseRequested(request: Request, url: URL): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/event-stream") || url.searchParams.get("transport") === "sse";
}

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function responseSuccess(payload: RpcSuccess, useSse: boolean): Response {
  if (useSse) {
    return sseResponse([sseMessage("message", payload)]);
  }
  return json(payload);
}

function responseError(
  id: RpcRequest["id"],
  code: number,
  message: string,
  status: number,
  useSse: boolean,
): Response {
  if (useSse) {
    return sseResponse([sseMessage("message", makeRpcErrorPayload(id, code, message))]);
  }
  return makeRpcError(id, code, message, status);
}

async function handleToolsCall(
  id: RpcRequest["id"],
  params: RpcRequest["params"] | undefined,
  useSse: boolean,
): Promise<Response> {
  const name = params?.name;
  if (!name || typeof name !== "string") {
    return responseError(id, -32602, "Invalid params: tool name is required", 400, useSse);
  }

  try {
    const result = await executeMcpTool(name, params?.arguments ?? {});
    return responseSuccess(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          structuredContent: result.data,
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data),
            },
          ],
          isError: false,
        },
      },
      useSse,
    );
  } catch (err) {
    if (err instanceof McpInputError) {
      return responseError(id, -32602, err.message, 400, useSse);
    }

    const message = err instanceof Error ? err.message : "Internal error";
    return responseError(id, -32000, message, 500, useSse);
  }
}

export const GET: RequestHandler = async ({ request, url }) => {
  const payload: RpcSuccess = {
    jsonrpc: "2.0",
    id: null,
    result: {
      server: "trainer-mcp",
      version: "1.0.0",
      capabilities: { tools: true },
      tools: listMcpTools(),
    },
  };

  if (isSseRequested(request, url)) {
    return sseResponse([
      sseMessage("ready", {
        server: "trainer-mcp",
        version: "1.0.0",
        capabilities: { tools: true },
      }),
      sseMessage("tools", { tools: listMcpTools() }),
    ]);
  }

  return json(payload);
};

export const POST: RequestHandler = async ({ request, url }) => {
  const useSse = isSseRequested(request, url);

  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return responseError(null, -32700, "Invalid JSON", 400, useSse);
  }

  const { id = null, method, params } = body;

  if (!method) {
    return responseError(id, -32600, "Invalid Request: method is required", 400, useSse);
  }

  // ── MCP Handshake ──────────────────────────────────────────────────────────

  // Claude sends `initialize` first to negotiate protocol version & capabilities.
  if (method === "initialize") {
    return responseSuccess(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "trainer-mcp",
            version: "1.0.0",
          },
        },
      },
      useSse,
    );
  }

  // Claude sends this notification after a successful `initialize`.
  // It is a one-way notification so no meaningful result is expected,
  // but we must not return a Method-Not-Found error.
  if (method === "notifications/initialized") {
    return responseSuccess(
      {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {},
      },
      useSse,
    );
  }

  // ── Tool Methods ───────────────────────────────────────────────────────────

  if (method === "tools/list") {
    return responseSuccess({ jsonrpc: "2.0", id, result: { tools: listMcpTools() } }, useSse);
  }

  if (method === "tools/call") {
    return handleToolsCall(id, params, useSse);
  }

  // ── Fallback ───────────────────────────────────────────────────────────────

  return responseError(id, -32601, `Method not found: ${method}`, 404, useSse);
};
