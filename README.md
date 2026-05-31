# Carbono — Image-generation MCP for the AI

**Carbono** is an [MCP](https://modelcontextprotocol.io) server whose purpose is
to **generate images for the AI**. The AI describes the visual content with HTML
(using **Tailwind CSS v4** classes and **DaisyUI** components) and Carbono renders
it to **PNG** with headless Chrome, returning the image inline as an MCP image
content block.

The transport is **stdio**: the server speaks JSON-RPC over `stdin`/`stdout`, so
it integrates directly with any MCP client (Claude Desktop, Claude Code, etc.)
without opening ports or running HTTP servers.

---

## How it works

```
AI  ──(HTML + Tailwind/DaisyUI)──▶  Carbono (MCP stdio)
                                       │
                                       ├─ compiles CSS (Tailwind v4 + DaisyUI)
                                       ├─ assembles a full HTML document
                                       └─ renders with headless Chrome (Puppeteer)
                                       │
AI  ◀──────────(inline PNG image)──────┘
```

Carbono keeps a *workspace* on disk with documents, pages, templates and
reusable palettes, so the AI can build compositions step by step and re-render
them whenever needed.

---

## Project structure

```
index.ts            →  stdio entrypoint (boots the McpServer)
tools.ts            →  Central tool registry (Registry Pattern)
types.ts            →  Shared types: ToolDefinition, ok() helper
tools/              →  Tool definitions by domain
  ├─ document.tool.ts   →  create / get / list / delete / history of documents
  ├─ page.tool.ts       →  add / edit / reorder pages and render to PNG
  ├─ palette.tool.ts    →  color palettes and DaisyUI themes
  └─ template.tool.ts   →  reusable templates
carbono/            →  Rendering and storage core
  ├─ render.ts          →  HTML → PNG with headless Chrome
  ├─ tailwind.ts        →  compiles Tailwind v4 + DaisyUI
  ├─ schema.ts          →  Zod schemas of the data model
  ├─ store.ts           →  workspace persistence
  └─ history.ts         →  operation history and rollback
util/               →  envs, logger and workspace paths
scripts/            →  Puppeteer browser installation
```

---

## Requirements

- [Bun](https://bun.sh) (recommended) or Node.js 20+
- A Chromium browser for Puppeteer (downloaded automatically on `postinstall`)

---

## Installation

```bash
bun install        # installs dependencies and downloads Chromium (postinstall)
```

If you need to (re)download the browser manually:

```bash
bun run browser:install
```

---

## Running

```bash
bun run index.ts
# or
bun run start
```

The process waits for JSON-RPC messages on stdin. It prints nothing to stdout
(reserved for the MCP protocol); logs are written to `logs/agents.log`.

### Configuring an MCP client

Example entry in an MCP client configuration (Claude Desktop / Claude Code):

```json
{
  "mcpServers": {
    "carbono": {
      "command": "bun",
      "args": ["run", "C:/path/to/mcp-carbono/index.ts"]
    }
  }
}
```

---

## Available tools

All tools are exposed with the `carbono_` prefix.

### Documents
| Tool | Description |
|---|---|
| `carbono_document_create`     | Creates a document (optionally from a template and with a palette) |
| `carbono_document_get`        | Returns the document metadata and the list of pages (id and name, without the HTML) |
| `carbono_document_page_get`   | Returns the full information of a single page (including its HTML) |
| `carbono_document_list`       | Lists the stored documents |
| `carbono_document_delete`     | Deletes a document |
| `carbono_document_rename`     | Renames a document |
| `carbono_document_history`    | Returns the operation history |
| `carbono_document_rollback`   | Rolls the document back to a previous version |

### Pages (includes image generation)
| Tool | Description |
|---|---|
| `carbono_page_add`        | Adds a page with HTML (Tailwind + DaisyUI) |
| `carbono_page_update`     | Replaces a page's HTML |
| `carbono_page_delete`     | Deletes a page |
| `carbono_page_reorder`    | Reorders the pages |
| `carbono_page_get_html`   | Returns the raw HTML or the assembled document |
| `carbono_page_screenshot` | **Renders the page to PNG** and returns it inline as an image |

### Palettes
| Tool | Description |
|---|---|
| `carbono_palette_save`   | Saves a palette (CSS variables + DaisyUI theme) |
| `carbono_palette_list`   | Lists the saved palettes |
| `carbono_palette_apply`  | Applies a palette to a document |
| `carbono_palette_delete` | Deletes a palette |

### Templates
| Tool | Description |
|---|---|
| `carbono_template_save`   | Saves a document (or a subset of pages) as a template |
| `carbono_template_list`   | Lists the templates |
| `carbono_template_apply`  | Applies a template to a new or existing document |
| `carbono_template_delete` | Deletes a template |

---

## Typical flow

1. `carbono_document_create` → create a document.
2. `carbono_palette_save` + `carbono_palette_apply` → (optional) define the colors.
3. `carbono_page_add` → add one or more pages with HTML/Tailwind/DaisyUI.
4. `carbono_page_screenshot` → **get the PNG image** ready for the AI.

---

## Image generation

`carbono_page_screenshot` renders the page with **headless Chrome** via Puppeteer
([carbono/render.ts](carbono/render.ts)). In development (Windows/macOS) Puppeteer
uses the Chromium it downloads at install time; on Linux servers, the stability
flags (`--no-sandbox`, `--disable-dev-shm-usage`, `--no-zygote`, etc.) are already
configured.

---

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `CARBONO_WORKSPACE_DIR`        | Workspace folder (documents, templates, palettes, history). | `<project>/workspace` |
| `CARBONO_PUPPETEER_EXECUTABLE` | Path to a system Chrome/Chromium binary. Only if you want to force your own instead of Puppeteer's. | _(empty → uses Puppeteer's)_ |
| `PUPPETEER_CACHE_DIR`          | Browser cache path. If set, honor it both at install and run time. | `<project>/.puppeteer-cache` |

---

## Notes

- The transport is **stdio**; there is no HTTP server or webhooks.
- `stdout` is reserved for the MCP protocol: logging is written to
  `logs/agents.log`.
