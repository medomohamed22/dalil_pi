import "server-only";
import { assertPublicUrl, fetchWithTimeout } from "./net";

/**
 * Minimal client for the Meta Model API (OpenAI-compatible).
 * Base URL defaults to https://api.meta.ai/v1. The user's key is passed per
 * request from the browser and never persisted server-side.
 */
export interface MetaConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type ChatMsg =
  | { role: "developer" | "system" | "user"; content: ChatContent }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface FunctionTool {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

async function base(cfg: MetaConfig): Promise<string> {
  // Local test servers only (never enabled in production builds on Vercel).
  if (process.env.DALIL_TEST_MODEL_BASE && cfg.baseUrl === process.env.DALIL_TEST_MODEL_BASE && !process.env.VERCEL) {
    return cfg.baseUrl.replace(/\/+$/, "");
  }
  const url = await assertPublicUrl(cfg.baseUrl);
  return url.toString().replace(/\/+$/, "");
}

function headers(cfg: MetaConfig): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  let msg = body.slice(0, 400);
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message ?? j?.message ?? msg;
  } catch {
    /* not json */
  }
  return `Model API ${res.status}: ${msg}`;
}

export async function listModels(cfg: Pick<MetaConfig, "baseUrl" | "apiKey">): Promise<string[]> {
  const b = await base(cfg as MetaConfig);
  const res = await fetchWithTimeout(`${b}/models`, {
    headers: headers(cfg as MetaConfig),
    timeoutMs: 15000,
  });
  if (!res.ok) throw new Error(await errorText(res));
  const j = await res.json();
  const list: unknown[] = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  return list
    .map((m) => (typeof m === "string" ? m : (m as { id?: string })?.id))
    .filter((x): x is string => typeof x === "string")
    .sort();
}

/**
 * Streaming chat completion with function tools. Yields text deltas and
 * returns the assembled tool calls once the stream ends.
 */
export async function* streamChat(
  cfg: MetaConfig,
  messages: ChatMsg[],
  tools: FunctionTool[],
  signal?: AbortSignal,
  toolChoice: "auto" | "none" | { type: "function"; function: { name: string } } = "auto",
): AsyncGenerator<{ text: string }, { toolCalls: ToolCall[]; text: string }> {
  const b = await base(cfg);
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    // The Meta API only accepts tool_choice "auto": to force one function, offer only that tool.
    ...(toolChoice === "none"
      ? {}
      : typeof toolChoice === "object"
        ? { tools: tools.filter((t) => t.function.name === toolChoice.function.name), tool_choice: "auto" }
        : { tools, tool_choice: toolChoice }),
    stream: true,
  };
  if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;

  const res = await fetchWithTimeout(`${b}/chat/completions`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(body),
    timeoutMs: 240000,
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await errorText(res));

  const calls = new Map<number, ToolCall>();
  let text = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        text += delta.content;
        yield { text: delta.content };
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = calls.get(idx) ?? { id: "", name: "", arguments: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        calls.set(idx, cur);
      }
    }
  }

  const toolCalls = [...calls.values()].map((c, i) => ({
    ...c,
    id: c.id || `call_${i}_${Date.now()}`,
  }));
  return { toolCalls, text };
}

export interface SearchResult {
  answer: string;
  sources: Array<{ url: string; title?: string }>;
}

/**
 * Web search via the Meta Responses API built-in `web_search` tool.
 */
export async function webSearch(cfg: MetaConfig, query: string, signal?: AbortSignal): Promise<SearchResult> {
  const b = await base(cfg);
  let res = await fetchWithTimeout(`${b}/responses`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      model: cfg.model,
      input:
        "Search the web and list up to 8 concrete offers as compact lines: store | product | price + currency | product URL | rating if shown. No prose.\n\nQuery: " +
        query,
      tools: [{ type: "web_search" }],
      reasoning: { effort: "minimal" },
      max_output_tokens: 1200,
    }),
    timeoutMs: 25000,
    signal,
  });
  if (res.status === 400) {
    // Some deployments reject reasoning/max_output_tokens on Responses — retry plain.
    res = await fetchWithTimeout(`${b}/responses`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({ model: cfg.model, input: `List concrete shopping offers (store | product | price | URL).\n\nQuery: ${query}`, tools: [{ type: "web_search" }] }),
      timeoutMs: 20000,
      signal,
    });
  }
  if (!res.ok) throw new Error(await errorText(res));
  const j = await res.json();

  let answer = typeof j?.output_text === "string" ? j.output_text : "";
  const sources: SearchResult["sources"] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(j?.output) ? j.output : []) {
    if (item?.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (!answer && typeof part?.text === "string") answer += part.text;
      for (const ann of part?.annotations ?? []) {
        const url = ann?.url ?? ann?.url_citation?.url;
        if (url && !seen.has(url)) {
          seen.add(url);
          sources.push({ url, title: ann?.title ?? ann?.url_citation?.title });
        }
      }
    }
  }
  return { answer: answer.slice(0, 4000), sources: sources.slice(0, 10) };
}
