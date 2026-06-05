# D&D Local Server - AI System Design Document

This document serves as the master blueprint for an AI coding assistant (e.g., Cursor, GitHub Copilot) to build a locally hosted D&D server. It outlines the architecture, tech stack, feature scope, and implementation phases to ensure context is maintained across the entire codebase.

---

## 1. System Overview
A locally hosted, all-in-one D&D server running in a single Docker container. The system serves as a hybrid Virtual Tabletop (VTT), character/inventory manager, and DM campaign wiki. 

**Target Environment:** Local Wi-Fi network (bound to `0.0.0.0`).
**Primary Client Devices:** Players will connect primarily via mobile phones; the UI must be mobile-first and touch-optimized.

---

## 2. Architecture & Tech Stack
* **Backend:** Node.js with Express (API routing and static file serving).
* **Real-time Communication:** Socket.io (instant VTT updates, dice rolls, chat).
* **Frontend:** React (component-based, responsive UI).
* **Database:** SQLite (lightweight, file-based database for local storage).
* **ORM:** Prisma (schema definition, migrations, and database interactions).
* **Deployment:** Docker (Single-container "Monolith" architecture).
* **Cloud Backup:** `rclone` (command-line utility) to sync and securely upload automated or manual server backups to Google Drive.
* **Archiving:** Node.js native `zlib` or `archiver` package to compress the database and uploads directory into a `.zip` file before triggering rclone.

---

## 3. Core Features

### 3.1 Mobile-First UI/UX
* **Responsive Layout:** A bottom navigation bar or swipe-tabs to toggle between **Map**, **Character Sheet**, and **Chat/Dice**.
* **Touch Optimizations:** Token movement utilizes touch-drag events. UI elements must have mobile-friendly hitboxes.

### 3.2 Virtual Tabletop (VTT)
* **Map System:** Uploadable background images with an overlay grid (squares/hexes).
* **Token Management:** Draggable player/monster tokens that snap to the grid. Real-time synchronization across all connected clients via Socket.io.
* **Fog of War:** Manual system for the DM to mask the map and selectively reveal areas.

### 3.3 Character Sheets & Mechanics
* **Interactive 5e Sheets:** React forms that auto-calculate modifiers based on core attributes.
* **Click-to-Roll:** Integration between the sheet and shared chat (e.g., clicking a weapon or skill auto-rolls 1d20 + modifiers and broadcasts via WebSockets).
* **Shared Chat:** Real-time chat log for dice results, system messages, and player communication.

### 3.4 Campaign Wiki & Lore Hub
* **DM Workspace:** Rich-text editor for creating articles (NPCs, locations, lore).
* **Player Journal:** A "Visible to Players" boolean toggle. Unlocked articles appear in a read-only, searchable Player Journal tab.

### 3.5 Cloud Backup System
* **Archive Generation:** The system packages the SQLite `.db` file and the `uploads/` directory into a timestamped `.zip` file stored in a local `backups/` folder.
* **Google Drive Integration:** Uses `child_process.exec()` in Node.js to trigger an `rclone copy` command, moving the `.zip` file to a configured Google Drive remote.
* **DM Controls:** A dedicated settings page where the DM can trigger a "Backup Now" event and see the console output/success status of the rclone process.

---

## 4. Data Structure (Core Prisma Models)
The AI should use these as the foundation for the `schema.prisma` file:

* **User:** `id`, `username`, `role` (DM or PLAYER).
* **Character:** `id`, `userId`, `name`, `stats` (JSON or fields), `hp`, `inventory`, `modifiers`.
* **Map:** `id`, `imageUrl`, `gridSize`, `fogState` (JSON).
* **Token:** `id`, `mapId`, `characterId`, `x`, `y`, `imageUrl`.
* **WikiArticle:** `id`, `title`, `content` (Rich Text/Markdown), `isVisibleToPlayers`, `tags`.

---

## 5. Containerization Strategy
* **Single-Container Monolith:** The React frontend is compiled into static files (`npm run build`) and placed in a public directory. The Node.js Express backend serves these static files on the root route (`/`), while handling API and Socket.io traffic on the same port.
* **System Dependencies:** The `Dockerfile` must install the `rclone` binary via the OS package manager (e.g., `apt-get install rclone`).
* **Volumes:** Persistent volumes must map the SQLite `.db` file, an `uploads/` directory (for map/token images), and the `/root/.config/rclone/rclone.conf` file (for Google Drive authentication) to prevent data loss.

---

## 6. Implementation Phases (AI Guide)
**Phase 1: Foundation & Docker**
* Initialize Node.js backend and React frontend.
* Configure `Dockerfile` and `docker-compose.yml` for the monolith architecture (including rclone installation).
* Setup Prisma with SQLite.

**Phase 2: API & Socket Integration**
* Establish Express routing and static file serving.
* Implement Socket.io server and client-side connection context.
* Build basic chat interface to verify real-time communication.

**Phase 3: Database & State Management**
* Write `schema.prisma` models.
* Create CRUD API endpoints for Users, Characters, and WikiArticles.

**Phase 4: Mobile UI & Character Sheets**
* Build mobile-responsive layout with navigation tabs.
* Implement 5e auto-calculating character sheet logic.
* Wire "Click-to-roll" from sheets into the Socket.io chat.

**Phase 5: Virtual Tabletop (VTT)**
* Implement Canvas/React-Konva for map rendering.
* Add grid snapping and touch-drag logic for tokens.
* Broadcast token X/Y coordinates via WebSockets.
* Build DM controls for manual Fog of War.

**Phase 6: Cloud Backups (rclone)**
* Implement a Node.js utility to zip the database and uploads directory.
* Write a backend route that utilizes `child_process` to execute `rclone copy` and streams the success/failure state back to the frontend.
* Add a "Backup Settings" UI panel in the React frontend for the DM.
