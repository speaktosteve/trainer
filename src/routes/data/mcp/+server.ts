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
  };
}

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

export const GET: RequestHandler = async () =>
  json({
    jsonrpc: "2.0",
    result: {
      server: "trainer-mcp",
      version: "1.0.0",
      capabilities: { tools: true },
      tools: listMcpTools(),
    },
  });

export const POST: RequestHandler = async ({ request }) => {
  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return makeRpcError(null, -32700, "Invalid JSON", 400);
  }

  const { id = null, method, params } = body;

  if (!method) {
    return makeRpcError(id, -32600, "Invalid Request: method is required", 400);
  }

  if (method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: { tools: listMcpTools() },
    });
  }

  if (method === "tools/call") {
    const name = params?.name;
    if (!name || typeof name !== "string") {
      return makeRpcError(id, -32602, "Invalid params: tool name is required", 400);
    }

    try {
      const result = await executeMcpTool(name, params?.arguments ?? {});
      return json({
        jsonrpc: "2.0",
        id,
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
      });
    } catch (err) {
      if (err instanceof McpInputError) {
        return makeRpcError(id, -32602, err.message, 400);
      }
      const message = err instanceof Error ? err.message : "Internal error";
      return makeRpcError(id, -32000, message, 500);
    }
  }

  return makeRpcError(id, -32601, `Method not found: ${method}`, 404);
};
