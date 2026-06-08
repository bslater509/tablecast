-- CreateTable
CREATE TABLE "mcp_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tool" TEXT NOT NULL,
    "arguments" TEXT NOT NULL,
    "result" TEXT,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_response_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operation" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "rawReply" TEXT NOT NULL,
    "parsedOk" BOOLEAN NOT NULL,
    "errorMsg" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "mcp_logs_tool_idx" ON "mcp_logs"("tool");

-- CreateIndex
CREATE INDEX "mcp_logs_createdAt_idx" ON "mcp_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_response_logs_operation_idx" ON "ai_response_logs"("operation");

-- CreateIndex
CREATE INDEX "ai_response_logs_createdAt_idx" ON "ai_response_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_response_logs_parsedOk_idx" ON "ai_response_logs"("parsedOk");
