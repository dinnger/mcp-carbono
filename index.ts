#!/usr/bin/env bun
// ─── Carbono MCP — stdio entrypoint ───────────────────────────────────────────
//
// Carbono es un servidor MCP cuya función es generar imágenes para la IA:
// la IA describe el contenido con HTML (Tailwind v4 + DaisyUI) y Carbono lo
// renderiza a PNG con Chrome headless, devolviendo la imagen en línea.
//
// Transport:  stdio (JSON-RPC sobre stdin/stdout)
// Run:        bun run index.ts
//
// IMPORTANTE: en modo stdio, stdout está reservado para el protocolo MCP.
// Nunca escribas con console.log; el logging va a archivo (util/logger.ts).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeTools } from "./tools.ts";
import { closeBrowser } from "./carbono/render.ts";
import { logger } from "./util/logger.ts";

async function main(): Promise<void> {
	const server = new McpServer({ name: "carbono", version: "1.0.0" });
	initializeTools(server);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.info("[carbono] servidor MCP listo (stdio)");

	const shutdown = async () => {
		logger.info("[carbono] cerrando…");
		await closeBrowser().catch(() => undefined);
		await server.close().catch(() => undefined);
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err) => {
	logger.error(`[carbono] fallo al iniciar: ${err}`);
	process.exit(1);
});
