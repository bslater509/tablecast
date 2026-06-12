// =============================================================================
// Tablecast — AI Generation Routes
// NPC, character, monster generation, session tools, text expansion, interview (v2)
// =============================================================================
"use strict";

const { Router } = require("express");
const { requireDm } = require("../../auth");
const router = Router();

const {
  handleGenerateNpcOptions,
  handleGenerateNpc,
  handleGenerateCharacterOptions,
  handleGenerateCharacter,
  handleGenerateMonsterOptions,
  handleGenerateMonster,
  handleBuildEncounter,
  handleEncounterDescription,
  handleSessionRecap,
  handleSessionAgenda,
  handleExpandText,
  handleNpcInterview,
  handleGenerateHooks,
  handleGenerateNames,
  handleGenerateWikiArticle,
  handleGenerateDescription,
  handleGenerateTravel,
  handleGenerateNpcPhrases,
  handleDetectRollChips,
  handleDeployTest,
} = require("./handlers");

router.post("/generate-npc-options", requireDm, handleGenerateNpcOptions);
router.post("/generate-npc", requireDm, handleGenerateNpc);
router.post("/generate-character-options", requireDm, handleGenerateCharacterOptions);
router.post("/generate-character", requireDm, handleGenerateCharacter);
router.post("/generate-monster-options", requireDm, handleGenerateMonsterOptions);
router.post("/generate-monster", requireDm, handleGenerateMonster);
router.post("/build-encounter", requireDm, handleBuildEncounter);
router.post("/encounter-description", requireDm, handleEncounterDescription);
router.post("/session-recap", requireDm, handleSessionRecap);
router.post("/session-agenda", requireDm, handleSessionAgenda);
router.post("/expand-text", requireDm, handleExpandText);
router.post("/npc-interview", requireDm, handleNpcInterview);
router.post("/generate-hooks", requireDm, handleGenerateHooks);
router.post("/generate-names", requireDm, handleGenerateNames);
router.post("/generate-wiki-article", requireDm, handleGenerateWikiArticle);
router.post("/generate-description", requireDm, handleGenerateDescription);
router.post("/generate-travel", requireDm, handleGenerateTravel);
router.post("/generate-npc-phrases", requireDm, handleGenerateNpcPhrases);
router.post("/detect-roll-chips", requireDm, handleDetectRollChips);
router.post("/deploy-test", handleDeployTest);
router.get("/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

module.exports = router;
