import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { mounts } from "../routes/mounts.js";
import { requestSchemas } from "./openapi.schemas.js";

type Handler = ((...args: never[]) => unknown) & { roles?: string[] };
type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] } };

export type Operation = { method: string; path: string; roles: string[] | null; authenticated: boolean; handler: Handler };

// Walks the real routers, so every mounted route is listed.
export function operations(): Operation[] {
  const rows: Operation[] = [];
  for (const [prefix, router] of mounts) {
    for (const layer of (router as unknown as { stack: RouteLayer[] }).stack) {
      if (!layer.route) {
        continue;
      }
      const handlers = layer.route.stack.map((item) => item.handle);
      const roles = handlers.find((handle) => Array.isArray(handle.roles))?.roles ?? null;
      for (const method of Object.keys(layer.route.methods)) {
        rows.push({
          method,
          path: `${prefix}${layer.route.path === "/" ? "" : layer.route.path}`,
          roles,
          authenticated: handlers.includes(requireAuth as never),
          handler: handlers[handlers.length - 1]!,
        });
      }
    }
  }
  return rows;
}

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
    },
  },
};

function jsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function queryParameters(schema: z.ZodType | undefined) {
  if (!schema) {
    return [];
  }
  const json = jsonSchema(schema) as { properties?: Record<string, object>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, value]) => ({
    name,
    in: "query",
    required: json.required?.includes(name) ?? false,
    schema: value,
  }));
}

let cached: object | undefined;

export function openapiDocument() {
  if (cached) {
    return cached;
  }
  const paths: Record<string, Record<string, object>> = {};
  for (const op of operations()) {
    const openPath = op.path.replace(/:(\w+)/g, "{$1}");
    const pathParams = [...op.path.matchAll(/:(\w+)/g)].map((match) => ({ name: match[1], in: "path", required: true, schema: { type: "string" } }));
    const schemas = requestSchemas.get(op.handler) ?? {};
    const tag = op.path.split("/")[3] ?? "api";
    const isWrite = op.method !== "get";
    paths[openPath] ??= {};
    paths[openPath][op.method] = {
      tags: [tag],
      summary: `${op.method.toUpperCase()} ${op.path}`,
      description: op.roles ? `Roles: ${op.roles.join(", ")}.` : op.authenticated ? "Any signed-in user." : "Public.",
      ...(op.authenticated ? { security: [{ bearer: [] }] } : { security: [] }),
      parameters: [
        ...pathParams,
        ...queryParameters(schemas.query),
        ...(op.method === "post" ? [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 200 } }] : []),
      ],
      ...(schemas.body ? { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(schemas.body) } } } } : {}),
      responses: {
        [schemas.created || (op.method === "post" && /\/(?:$|feedback$)/.test(op.path)) ? "201" : "200"]: {
          ...(schemas.produces
            ? { description: `Success: a ${schemas.produces} file.`, content: { [schemas.produces]: { schema: { type: "string", format: "binary" } } } }
            : {
                description: "Success: `{ data, meta? }`.",
                content: { "application/json": { schema: { type: "object", properties: { data: schemas.response ? jsonSchema(schemas.response) : {}, meta: {} } } } },
              }),
        },
        ...(schemas.body || schemas.query ? { 400: { $ref: "#/components/responses/Error" } } : {}),
        ...(op.authenticated ? { 401: { $ref: "#/components/responses/Error" } } : {}),
        ...(op.roles ? { 403: { $ref: "#/components/responses/Error" } } : {}),
        ...(pathParams.length ? { 404: { $ref: "#/components/responses/Error" } } : {}),
        ...(isWrite || schemas.conflict ? { 409: { $ref: "#/components/responses/Error" } } : {}),
        429: { $ref: "#/components/responses/Error" },
        ...(schemas.unavailable ? { 503: { $ref: "#/components/responses/Error" } } : {}),
      },
    };
  }
  cached = {
    openapi: "3.1.0",
    info: {
      title: "Field Service Management API",
      version: "1.0.0",
      description:
        "Versioned under /api/v1. Errors are `{ error: { code, message, details? } }`; an illegal state change is `409 INVALID_TRANSITION`. Lists take `page` and `limit` (max 100) and return `meta`. Times are ISO 8601 UTC; money is a decimal string with a currency code. Send `Idempotency-Key` on POSTs that a client may retry. Native clients send `X-Client: mobile` to get the refresh token in the body. See docs/api.md.",
    },
    servers: [{ url: "http://localhost:4000" }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: { Error: errorSchema },
      responses: { Error: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
    },
    paths,
  };
  return cached;
}
