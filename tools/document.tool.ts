import z from "zod";
import { ok } from "../types";
import type { ToolDefinition } from "../types";
import {
	deleteDocument,
	listDocuments,
	loadDocument,
	loadTemplate,
	saveDocument,
} from "../carbono/store";
import { appendOperation, readHistory, rollback } from "../carbono/history";
import type { CarbonoDocument } from "../carbono/schema";

export const documentTools: ToolDefinition[] = [
	{
		name: "carbono_document_create",
		description:
			"Creates a new carbono document. Optionally seeds pages from a template and assigns a palette.",
		inputSchema: {
			name: z.string().describe("Display name of the document"),
			fromTemplate: z
				.string()
				.optional()
				.describe("Name of an existing template to seed pages from"),
			palette: z
				.string()
				.optional()
				.describe("Name of a saved palette to assign to the document"),
		},
		handler: async ({
			name,
			fromTemplate,
			palette,
		}: { name: string; fromTemplate?: string; palette?: string }) => {
			const now = new Date().toISOString();
			const doc: CarbonoDocument = {
				id: crypto.randomUUID(),
				name,
				pages: [],
				paletteName: palette,
				createdAt: now,
				updatedAt: now,
			};
			if (fromTemplate) {
				const t = await loadTemplate(fromTemplate);
				doc.pages = t.pages.map((p) => ({ ...p, id: crypto.randomUUID() }));
				if (!doc.paletteName) doc.paletteName = t.paletteName;
			}
			await saveDocument(doc);
			await appendOperation(doc.id, { type: "doc.created", doc });
			return ok({ docId: doc.id, doc });
		},
	},
	{
		name: "carbono_document_get",
		description:
			"Loads a document and returns its metadata plus the list of its pages (page id and name only, without the HTML body). Use carbono_document_page_get to fetch the full content of a specific page.",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
		},
		handler: async ({ docId }: { docId: string }) => {
			const doc = await loadDocument(docId);
			return ok({
				id: doc.id,
				name: doc.name,
				paletteName: doc.paletteName,
				createdAt: doc.createdAt,
				updatedAt: doc.updatedAt,
				pages: doc.pages.map((p) => ({ id: p.id, name: p.name })),
			});
		},
	},
	{
		name: "carbono_document_page_get",
		description:
			"Returns the full information of a single page within a document, including its HTML body.",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			pageId: z.string().describe("ID of the page to retrieve"),
		},
		handler: async ({ docId, pageId }: { docId: string; pageId: string }) => {
			const doc = await loadDocument(docId);
			const page = doc.pages.find((p) => p.id === pageId);
			if (!page) throw new Error(`page not found: ${pageId}`);
			return ok(page);
		},
	},
	{
		name: "carbono_document_list",
		description: "Lists all stored documents (id, name, pageCount, updatedAt)",
		inputSchema: {},
		handler: async () => {
			return ok(await listDocuments());
		},
	},
	{
		name: "carbono_document_delete",
		description: "Deletes a document permanently. History file remains on disk.",
		inputSchema: {
			docId: z.string().describe("ID of the document to delete"),
		},
		handler: async ({ docId }: { docId: string }) => {
			await deleteDocument(docId);
			return ok({ docId, deleted: true });
		},
	},
	{
		name: "carbono_document_rename",
		description: "Renames a document",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			name: z.string().describe("New name"),
		},
		handler: async ({ docId, name }: { docId: string; name: string }) => {
			const doc = await loadDocument(docId);
			const before = doc.name;
			doc.name = name;
			await saveDocument(doc);
			await appendOperation(docId, {
				type: "doc.renamed",
				before,
				after: name,
			});
			return ok({ docId, name });
		},
	},
	{
		name: "carbono_document_history",
		description:
			"Returns the operation history of a document (version, timestamp, type).",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
		},
		handler: async ({ docId }: { docId: string }) => {
			const ops = await readHistory(docId);
			return ok(
				ops.map((o) => ({
					version: o.version,
					timestamp: o.timestamp,
					type: o.op.type,
				})),
			);
		},
	},
	{
		name: "carbono_document_rollback",
		description:
			"Rolls back the document to the given version (inclusive). Operations after that version are discarded.",
		inputSchema: {
			docId: z.string().describe("ID of the document"),
			version: z
				.number()
				.int()
				.nonnegative()
				.describe("Target version to roll back to (inclusive)"),
		},
		handler: async ({
			docId,
			version,
		}: { docId: string; version: number }) => {
			const doc = await rollback(docId, version);
			return ok(doc);
		},
	},
];
