# AI Agent Instructions - D&D Local Server Project

This document defines the specialized agent roles and system prompts to be used when generating code for this project. When assigning a task to the AI coding assistant, reference the appropriate agent role below to set its context and constraints.

## Global Coding Standards (Apply to all Agents)
* **Mobile-First:** All UI components must be built for mobile screens first. Ensure touch targets (buttons, tokens) are large enough for fingers (minimum 44x44px).
* **Network Binding:** The Node.js server must bind to `0.0.0.0` (not `localhost` or `127.0.0.1`) to allow Local Area Network (LAN) access from phones.
* **Simplicity:** Prefer readable, modular code over clever, heavily abstracted logic. 
* **Leverage Existing Libraries:** Prefer using well-established, maintained libraries rather than reinventing the wheel (e.g., for complex math, VTT operations, compression, or UI components).
* **Error Handling:** All async operations must have robust try/catch blocks. Gracefully handle WebSocket disconnections and reconnections.
* **Docker Container Rebuild:** Whenever codebase or config modifications are made, the Docker container must always be rebuilt and run (e.g. using `docker compose up --build -d` or building and restarting the container) to ensure the live environment runs the latest changes.
* **Debugging Tools:** Use the installed Debian package for Google Chrome when testing the site. If automated browser subagents fail to start due to environment loopback/CDP resolution issues (e.g., `failed to resolve CDP URLs` or `could not resolve IP for 127.0.0.1`), verify backend API endpoints directly using `curl http://localhost:3001/api/health` and verify client compilation from container build logs as a fallback validation mechanism.
* **Git Version Control:** Always push all changes to the repository, even if the changes were not originally made by the agent itself. When finished with a task, there should be no uncommitted or unpushed changes left in the workspace.


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
