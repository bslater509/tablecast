# AI Agent Instructions - D&D Local Server Project

This document defines the specialized agent roles and system prompts to be used when generating code for this project. When assigning a task to the AI coding assistant, reference the appropriate agent role below to set its context and constraints.

## Global Coding Standards (Apply to all Agents)
* **Mobile-First:** All UI components must be built for mobile screens first. Ensure touch targets (buttons, tokens) are large enough for fingers (minimum 44x44px).
* **Network Binding:** The Node.js server must bind to `0.0.0.0` (not `localhost` or `127.0.0.1`) to allow Local Area Network (LAN) access from phones.
* **Simplicity:** Prefer readable, modular code over clever, heavily abstracted logic. 
* **Leverage Existing Libraries:** Prefer using well-established, maintained libraries rather than reinventing the wheel (e.g., for complex math, VTT operations, compression, or UI components).
* **Error Handling:** All async operations must have robust try/catch blocks. Gracefully handle WebSocket disconnections and reconnections.
* **No Local Server Execution:** The server must **never** be run or tested locally. All runtime testing, verification, and deployment must happen on the host server.
* **Staging Server & Health:** The active server is hosted at `http://192.168.0.77:3001`. You can verify backend connectivity and health by calling `http://192.168.0.77:3001/api/health`.
* **GitHub Webhook Deployment:** Code updates are deployed to the remote server via Git. Pushing changes to the GitHub repository automatically triggers the Git stack webhook:
  `http://192.168.0.77:3000/api/git/stacks/2/webhook`
  This webhook pulls the latest codebase from GitHub and builds/starts the Docker stack remotely using Portainer/Docker Compose:
  `docker compose -p tablecast -f - up -d --remove-orphans --build --pull always`
  *Testing Note:* Triggering this webhook via a `POST` request initiates the deployment flow and returns a success response with the build logs.
* **Docker Container Rebuild:** Do not perform local Docker rebuilds. All Docker builds/rebuilds are handled automatically on the remote server when the stack webhook pulls updates.
* **Debugging Tools:** Use the installed Debian package for Google Chrome when testing the site (connecting to the remote host at `http://192.168.0.77:3001`). If automated browser subagents fail to resolve loopback or connection settings, verify the backend endpoints directly using `curl http://192.168.0.77:3001/api/health` and examine the webhook's return response or git webhook status for container build logs.
* **Git Version Control & Deployment Trigger:** Always push all changes to the repository, even if the changes were not originally made by the agent itself. Pushing is required to trigger the webhook and deploy the live changes. When finished with a task, there should be no uncommitted or unpushed changes left in the workspace.
* **No 5etools Repository Modifications:** Do not create, modify, or place any files in the 5etools repository folders (`5etoolsimg/`, `5etoolssrc/`). Any files or changes created in these directories that are not part of the official repositories must be deleted.

## Logging & Debugging Infrastructure

The server has a structured logging and debugging system designed to help AI agents self-diagnose.

### Structured JSON Logger (`server/src/utils/logger.js`)
- **Usage:** `const logger = require("../utils/logger")` → `logger.info(ns, msg, meta)`, `logger.error(ns, msg, meta)`, etc.
- **Namespaces** (`ns`): Use dotted hierarchies like `"http"`, `"socket"`, `"ai:chat"`, `"mcp"`, `"auth"`.
- **Output:** Every call produces a single JSON line on stdout (info/warn/debug) or stderr (error).
- **Control:** Set `LOG_LEVEL` env var — `silent` | `error` | `warn` | `info` (default) | `debug`.
- **Legacy DEBUG env:** The older `DEBUG=tablecast:*` namespace logger (`server/src/utils/debug.js`) still works alongside the new logger.
- **Migration:** When editing server code, prefer `logger.info/error/warn/debug` over `console.log/error`.

### Request ID Middleware
- Every HTTP request gets a unique `req.id` (8-char hex via `crypto.randomUUID()`).
- Log lines for the same request can be correlated by including `reqId: req.id` in the meta object.

### Morgan HTTP Logging
- All HTTP requests are logged as structured JSON via `morgan` with method, URL, status code, and response time.
- Output goes through the structured logger under namespace `"http"`.

### Centralized Error Handler (`server/src/index.js`)
- Use `throw new AppError(statusCode, message)` in routes to produce consistent JSON error responses.
- 500 errors include stack traces in the log; 4xx errors do not.
- The error middleware logs via `logger.error("http:error", ...)` with `reqId`, `status`, `error`, and `stack`.

### Debug Endpoints (all require DM auth via `x-tablecast-user-id: 1`)

| Endpoint | Description |
|---|---|
| `GET /api/debug` | Full server health: uptime, memory, DB status, entity counts, reference cache, active SSE transports |
| `GET /api/debug/mcp-logs?limit=50&tool=` | Recent MCP tool call audit trail from the `mcp_logs` table |
| `GET /api/debug/ai-logs?limit=50&operation=` | Recent AI response history from the `ai_response_logs` table (raw LLM output included) |
| `GET /api/ai/debug` | AI subsystem state: provider, model, API key status, response log stats, conversation counts, active SSE transports |

### Prisma Audit Models

**`mcp_logs`** — Every MCP tool invocation is persisted automatically:
- `tool`, `arguments` (JSON), `result` (JSON), `isError`, `createdAt`
- Indexed by `tool` and `createdAt` for efficient querying.

**`ai_response_logs`** — Every AI API call (via `performAiCall`) is persisted automatically:
- `operation`, `prompt` (first 5000 chars), `rawReply` (first 10000 chars), `parsedOk`, `errorMsg`, `durationMs`, `createdAt`
- Indexed by `operation`, `parsedOk`, and `createdAt`.
- Use this to debug LLM output issues: find failed parses with `WHERE parsedOk = false`.

### MCP SSE Heartbeat
- Active MCP SSE transport sessions log a `debug`-level heartbeat every 60s via namespace `"mcp:sse:heartbeat"`.
- Includes `sessionId`, `ageMs`, and `ageSeconds` to detect stale connections.

---


## Agent Roles

### 🛠️ Agent 1: The DevOps & Database Architect
**Focus:** Docker, Node.js server initialization, Prisma schema, SQLite management, and System Dependencies.
**Prompt Prefix:** *"Act as the DevOps and DB Architect. Your task is to..."*
**Directives:**
* Create a single `Dockerfile` that builds the React frontend, serves it via the Express backend, AND installs `rclone` via the OS package manager.
* Configure `docker-compose.yml` with persistent volumes mapped for the SQLite database, the `uploads/` directory, and the `rclone.conf` configuration file.
* Write the `schema.prisma` file strictly adhering to the entities defined in `dnd-local-server-design-doc.md`.
* Rebuild and restart the Docker container to ensure the updated deployment is running whenever code, schema, or configuration modifications are made.

### 🔌 Agent 2: The Backend & Real-Time Engineer
**Focus:** Express API routes, Socket.io handling, Prisma integration, and Cloud Backups via rclone.
**Prompt Prefix:** *"Act as the Backend Engineer. Your task is to..."*
**Directives:**
* Structure the Express app to correctly serve static files from the React build output.
* Implement robust Socket.io connections for all real-time events.
* Build CRUD API endpoints for managing the DM Wiki and character sheets securely via Prisma.
* **Cloud Backup Feature:** Implement a utility to zip the SQLite database and `uploads/` directory. Use Node's `child_process` to execute an `rclone copy` command that uploads the zip to Google Drive. Expose an Express endpoint for the DM to manually trigger this and return the terminal output.

### 📱 Agent 3: The Frontend UI/UX Developer
**Focus:** React components, mobile navigation, character sheet logic, and Tailwind/CSS styling.
**Prompt Prefix:** *"Act as the Frontend UI Developer. Your task is to..."*
**Directives:**
* Implement a mobile-friendly bottom navigation bar or swipeable tabs (Map, Character Sheet, Chat/Journal).
* Build the interactive D&D 5e Character Sheet. State management must auto-calculate ability modifiers dynamically when base stats change.
* Create the "Click-to-Roll" mechanics, capturing the user's action, calculating the total, and emitting the formatted result via the Socket.io client.

### 🗺️ Agent 4: The VTT Engine Developer
**Focus:** HTML5 Canvas / React-Konva rendering, token manipulation, and Grid/Fog mechanics.
**Prompt Prefix:** *"Act as the VTT Engine Developer. Your task is to..."*
**Directives:**
* Prioritize touch events (`onTouchStart`, `onTouchMove`) over mouse events for all interactive canvas elements.
* Render the background map image and overlay a responsive, scalable grid.
* Implement drag-and-drop logic for tokens that automatically calculates the nearest grid intersection and snaps to it upon release. Emit the new coordinates via WebSockets immediately.
* Build the DM's manual Fog of War tool, allowing the DM to draw/erase opaque polygon shapes over the top canvas layer.
