// ─── MCP response helper ──────────────────────────────────────────────────────

/** Wraps any value as a valid MCP tool text response */
export const ok = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ─── Tool Registry type ───────────────────────────────────────────────────────

import type { ZodRawShape } from "zod";

/**
 * Declarative tool definition used by the Registry.
 * Each tool file exports a `ToolDefinition[]`; `tools.ts` collects and
 * registers them all, then logs them to the console on startup.
 */
export interface ToolDefinition {
	/** Unique snake_case identifier shown to the LLM */
	name: string;
	/** Human-readable description shown to the LLM */
	description: string;
	/** Zod input schema that validates and documents parameters */
	inputSchema: ZodRawShape;
	// biome-ignore lint/suspicious/noExplicitAny: args are validated by Zod inside SDK
	handler: (args: any) => Promise<ReturnType<typeof ok >>;
}
