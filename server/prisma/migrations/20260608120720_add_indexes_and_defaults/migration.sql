-- CreateIndex
CREATE INDEX "ai_messages_createdAt_idx" ON "ai_messages"("createdAt");

-- CreateIndex
CREATE INDEX "characters_userId_idx" ON "characters"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_type_idx" ON "chat_messages"("type");

-- CreateIndex
CREATE INDEX "encounter_participants_encounterId_idx" ON "encounter_participants"("encounterId");

-- CreateIndex
CREATE INDEX "encounters_mapId_idx" ON "encounters"("mapId");

-- CreateIndex
CREATE INDEX "encounters_status_idx" ON "encounters"("status");

-- CreateIndex
CREATE INDEX "game_sessions_status_idx" ON "game_sessions"("status");

-- CreateIndex
CREATE INDEX "game_sessions_scheduledFor_idx" ON "game_sessions"("scheduledFor");

-- CreateIndex
CREATE INDEX "tokens_mapId_idx" ON "tokens"("mapId");

-- CreateIndex
CREATE INDEX "wiki_articles_category_idx" ON "wiki_articles"("category");

-- CreateIndex
CREATE INDEX "wiki_articles_isVisibleToPlayers_idx" ON "wiki_articles"("isVisibleToPlayers");
