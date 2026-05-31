import z from "zod";
import { ok } from "../types";
import type { ToolDefinition } from "../types";
import {
	deleteTemplate,
	listTemplates,
	loadDocument,
	loadTemplate,
	saveDocument,
	saveTemplate,
} from "../carbono/store";
import { appendOperation } from "../carbono/history";
import type { Page, Template } from "../carbono/schema";

export const templateTools: ToolDefinition[] = [
	{
		name: "carbono_template_save",
		description:
			"Saves the current document (or a subset of its pages) as a reusable template.",
		inputSchema: {
			name: z.string().describe("Template name (unique)"),
			fromDocId: z.string().describe("Source document ID"),
			pageIds: z
				.array(z.string())
				.optional()
				.describe("Specific page IDs to include. Omit to include all pages."),
		},
		handler: async ({
			name,
			fromDocId,
			pageIds,
		}: { name: string; fromDocId: string; pageIds?: string[] }) => {
			const doc = await loadDocument(fromDocId);
			const pages: Page[] = pageIds
				? doc.pages.filter((p) => pageIds.includes(p.id))
				: doc.pages;
			const tpl: Template = {
				name,
				pages: pages.map((p) => ({ ...p })),
				paletteName: doc.paletteName,
				createdAt: new Date().toISOString(),
			};
			await saveTemplate(tpl);
			return ok({ name, pageCount: tpl.pages.length });
		},
	},
	{
		name: "carbono_template_list",
		description: "Lists all stored templates",
		inputSchema: {},
		handler: async () => ok(await listTemplates()),
	},
	{
		name: "carbono_template_apply",
		description:
			"Applies a template. If targetDocId is provided, appends the template pages to that document; otherwise creates a new document.",
		inputSchema: {
			name: z.string().describe("Name of the template to apply"),
			targetDocId: z
				.string()
				.optional()
				.describe("If provided, append pages to this doc. Otherwise create new."),
			newDocName: z
				.string()
				.optional()
				.describe("Name for the new doc when targetDocId is omitted"),
		},
		handler: async ({
			name,
			targetDocId,
			newDocName,
		}: { name: string; targetDocId?: string; newDocName?: string }) => {
			const tpl = await loadTemplate(name);
			if (targetDocId) {
				const doc = await loadDocument(targetDocId);
				for (const src of tpl.pages) {
					const page: Page = { ...src, id: crypto.randomUUID() };
					doc.pages.push(page);
					await appendOperation(targetDocId, { type: "page.added", page });
				}
				await saveDocument(doc);
				return ok({ docId: targetDocId, appended: tpl.pages.length });
			}
			const now = new Date().toISOString();
			const doc = {
				id: crypto.randomUUID(),
				name: newDocName ?? name,
				pages: tpl.pages.map((p) => ({ ...p, id: crypto.randomUUID() })),
				paletteName: tpl.paletteName,
				createdAt: now,
				updatedAt: now,
			};
			await saveDocument(doc);
			await appendOperation(doc.id, { type: "doc.created", doc });
			return ok({ docId: doc.id, doc });
		},
	},
	{
		name: "carbono_template_delete",
		description: "Deletes a template",
		inputSchema: {
			name: z.string().describe("Name of the template to delete"),
		},
		handler: async ({ name }: { name: string }) => {
			await deleteTemplate(name);
			return ok({ name, deleted: true });
		},
	},
];
