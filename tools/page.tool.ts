import z from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ok } from "../types";
import type { ToolDefinition } from "../types";
import { loadDocument, loadPalette, loadTemplate, saveDocument } from "../carbono/store";
import { appendOperation } from "../carbono/history";
import { assembleHtml, screenshot } from "../carbono/render";
import { ensureWorkspace, paths } from "../util/workspace";
import type { Page } from "../carbono/schema";

async function activePalette(doc: { paletteName?: string }) {
	if (!doc.paletteName) return undefined;
	try {
		return await loadPalette(doc.paletteName);
	} catch {
		return undefined;
	}
}

export const pageTools: ToolDefinition[] = [
	{
		name: "carbono_page_add",
		description:
			"Adds a new page to a document. Optionally seeds the HTML from a template page.",
		inputSchema: {
			docId: z.string().describe("ID of the target document"),
			name: z.string().describe("Display name of the page"),
			html: z
				.string()
				.describe(
					"Body-only HTML content of the page (no <html>/<head>/<body> wrappers). Use Tailwind classes and DaisyUI components freely.",
				),
			fromTemplate: z
				.string()
				.optional()
				.describe("Template name to copy a page from"),
			fromTemplatePageId: z
				.string()
				.optional()
				.describe("ID of the template page to copy (defaults to first)"),
		},
		handler: async ({
			docId,
			name,
			html,
			fromTemplate,
			fromTemplatePageId,
		}: {
			docId: string;
			name: string;
			html: string;
			fromTemplate?: string;
			fromTemplatePageId?: string;
		}) => {
			const doc = await loadDocument(docId);
			let pageHtml = html;
			if (fromTemplate) {
				const t = await loadTemplate(fromTemplate);
				const src = fromTemplatePageId
					? t.pages.find((p) => p.id === fromTemplatePageId)
					: t.pages[0];
				if (src) pageHtml = src.html;
			}
			const page: Page = { id: crypto.randomUUID(), name, html: pageHtml };
			doc.pages.push(page);
			await saveDocument(doc);
			await appendOperation(docId, { type: "page.added", page });
			return ok({ pageId: page.id });
		},
	},
	{
		name: "carbono_page_update",
		description: "Replaces the HTML of an existing page (autosaves and records history).",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			pageId: z.string().describe("ID of the page to update"),
			html: z.string().describe("New body-only HTML for the page"),
		},
		handler: async ({
			docId,
			pageId,
			html,
		}: { docId: string; pageId: string; html: string }) => {
			const doc = await loadDocument(docId);
			const page = doc.pages.find((p) => p.id === pageId);
			if (!page) throw new Error(`page not found: ${pageId}`);
			const before = page.html;
			page.html = html;
			await saveDocument(doc);
			await appendOperation(docId, {
				type: "page.updated",
				pageId,
				before,
				after: html,
			});
			return ok({ docId, pageId });
		},
	},
	{
		name: "carbono_page_delete",
		description: "Removes a page from a document",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			pageId: z.string().describe("ID of the page to delete"),
		},
		handler: async ({ docId, pageId }: { docId: string; pageId: string }) => {
			const doc = await loadDocument(docId);
			const page = doc.pages.find((p) => p.id === pageId);
			if (!page) throw new Error(`page not found: ${pageId}`);
			doc.pages = doc.pages.filter((p) => p.id !== pageId);
			await saveDocument(doc);
			await appendOperation(docId, { type: "page.deleted", page });
			return ok({ docId, pageId, deleted: true });
		},
	},
	{
		name: "carbono_page_reorder",
		description: "Reorders the pages of a document",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			order: z
				.array(z.string())
				.describe("Array of page IDs in the desired order"),
		},
		handler: async ({
			docId,
			order,
		}: { docId: string; order: string[] }) => {
			const doc = await loadDocument(docId);
			const byId = new Map(doc.pages.map((p) => [p.id, p]));
			const next = order
				.map((id) => byId.get(id))
				.filter((p): p is NonNullable<typeof p> => Boolean(p));
			if (next.length !== doc.pages.length) {
				throw new Error("order must contain every existing page ID exactly once");
			}
			doc.pages = next;
			await saveDocument(doc);
			await appendOperation(docId, { type: "page.reordered", order });
			return ok({ docId, order });
		},
	},
	{
		name: "carbono_page_get_html",
		description:
			"Returns the HTML of a page. mode='raw' returns the stored body fragment; mode='full' returns the assembled HTML document (with compiled Tailwind+DaisyUI CSS and palette applied).",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			pageId: z.string().describe("ID of the page"),
			mode: z
				.enum(["raw", "full"])
				.default("raw")
				.describe("'raw' = body fragment, 'full' = complete <html> document"),
		},
		handler: async ({
			docId,
			pageId,
			mode,
		}: { docId: string; pageId: string; mode: "raw" | "full" }) => {
			const doc = await loadDocument(docId);
			const page = doc.pages.find((p) => p.id === pageId);
			if (!page) throw new Error(`page not found: ${pageId}`);
			if (mode === "raw") return ok({ html: page.html });
			const palette = await activePalette(doc);
			const full = await assembleHtml(page, palette);
			return ok({ html: full });
		},
	},
	{
		name: "carbono_page_screenshot",
		description:
			"Renders a page to PNG using headless Chrome. Always returns the image inline as an MCP image content block. When save=true (or a path is given) it also writes the PNG to disk and includes the absolute path in the response.",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			pageId: z.string().describe("ID of the page"),
			width: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Viewport width in px (default 1280)"),
			height: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Viewport height in px (default 800)"),
			save: z
				.boolean()
				.optional()
				.describe(
					"If true, also write the PNG to disk (default workspace/renders/<pageId>.png).",
				),
			path: z
				.string()
				.optional()
				.describe(
					"Absolute or relative path (or directory) where the PNG should be written. Implies save=true.",
				),
		},
		handler: async ({
			docId,
			pageId,
			width,
			height,
			save,
			path,
		}: {
			docId: string;
			pageId: string;
			width?: number;
			height?: number;
			save?: boolean;
			path?: string;
		}) => {
			const doc = await loadDocument(docId);
			const page = doc.pages.find((p) => p.id === pageId);
			if (!page) throw new Error(`page not found: ${pageId}`);
			const palette = await activePalette(doc);
			const buf = await screenshot(page, palette, {
				viewport: width && height ? { width, height } : undefined,
			});

			let savedPath: string | undefined;
			if (save || path) {
				await ensureWorkspace();
				// A path ending in a separator or with no .png extension is treated
				// as a directory; otherwise it's the full target file path.
				let target: string;
				if (!path) {
					target = join(paths.renders, `${pageId}.png`);
				} else if (path.endsWith("/") || path.endsWith("\\") || !/\.png$/i.test(path)) {
					target = join(path, `${pageId}.png`);
				} else {
					target = path;
				}
				target = resolve(target);
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, buf);
				savedPath = target;
			}

			const content: Array<Record<string, unknown>> = [
				{
					type: "image",
					data: Buffer.from(buf).toString("base64"),
					mimeType: "image/png",
				},
			];
			if (savedPath) {
				content.push({ type: "text", text: `Saved PNG to: ${savedPath}` });
			}
			return { content };
		},
	},
];
