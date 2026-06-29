import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Pluggable AI provider. Self-hosters set AI_PROVIDER in their environment
 * (lovable | openai | azure | none); the app picks credentials and base URL
 * accordingly. Returns a callable that resolves a model id to an AI-SDK model.
 *
 * Kept backward compatible: existing callers that import
 * `createLovableAiGatewayProvider(LOVABLE_API_KEY)` still work.
 */
export type AiProviderKind = "lovable" | "openai" | "azure" | "none";

export function getAiProviderKind(): AiProviderKind {
  const raw = (process.env.AI_PROVIDER ?? "lovable").toLowerCase();
  if (raw === "openai" || raw === "azure" || raw === "none" || raw === "lovable") return raw;
  return "lovable";
}

export function defaultChatModel(kind: AiProviderKind = getAiProviderKind()): string {
  switch (kind) {
    case "openai": return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    case "azure":  return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
    case "none":   return "noop";
    case "lovable":
    default:       return "google/gemini-3-flash-preview";
  }
}

class AiProviderDisabledError extends Error {
  constructor() {
    super("AI features are disabled (AI_PROVIDER=none). Configure an AI provider in Admin → Setup to enable.");
    this.name = "AiProviderDisabledError";
  }
}

/**
 * Resolve the configured provider into an AI-SDK compatible factory.
 * If `overrideKey` is provided (legacy callers), it's used as the Lovable key.
 */
export function createAiProvider(overrideKey?: string) {
  const kind = getAiProviderKind();

  if (kind === "none") {
    return (() => {
      throw new AiProviderDisabledError();
    }) as unknown as ReturnType<typeof createOpenAICompatible>;
  }

  if (kind === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("AI_PROVIDER=openai but OPENAI_API_KEY is not set");
    return createOpenAICompatible({
      name: "openai",
      baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${key}` },
    });
  }

  if (kind === "azure") {
    const key = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview";
    if (!key || !endpoint || !deployment) {
      throw new Error("AI_PROVIDER=azure requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT");
    }
    const baseURL = `${endpoint.replace(/\/+$/, "")}/openai/deployments/${deployment}`;
    return createOpenAICompatible({
      name: "azure",
      baseURL,
      headers: { "api-key": key },
      queryParams: { "api-version": apiVersion },
    });
  }

  // Lovable Gateway (default)
  const key = overrideKey ?? process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY for Lovable AI Gateway");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/** Back-compat shim for existing callers. */
export function createLovableAiGatewayProvider(lovableApiKey: string) {
  // If the operator switched to a different provider, honor that; otherwise
  // build a Lovable provider with the supplied key.
  if (getAiProviderKind() !== "lovable") return createAiProvider();
  return createAiProvider(lovableApiKey);
}