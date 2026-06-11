// =============================================================================
// Tablecast  NPC Dialogue Tree Routes
// Endpoints (mounted under /api/npcs):
//   GET    /api/npcs/:npcId/dialogue             — Get dialogue tree
//   PUT    /api/npcs/:npcId/dialogue             — Update dialogue tree (DM)
//   POST   /api/npcs/:npcId/dialogue/start       — Start dialogue, returns start node
//   POST   /api/npcs/:npcId/dialogue/advance     — Advance dialogue by node
//   POST   /api/npcs/:npcId/dialogue/evaluate    — Evaluate a condition (DM)
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm, getRequestUser } = require("../auth");
const logger = require("../utils/logger");
const {
  resolveNode,
  getStartNode,
  evaluateCondition,
  executeAction,
  pickWeightedRandom,
} = require("../utils/dialogueEngine");

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse JSON safely, returning fallback if invalid. */
function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

/** Validate that npcId is a positive integer */
function validateNpcId(id) {
  const num = Number(id);
  return Number.isInteger(num) && num > 0 ? num : null;
}

// ---------------------------------------------------------------------------
// GET /api/npcs/:npcId/dialogue  Get the dialogue tree for an NPC
// ---------------------------------------------------------------------------
router.get("/:npcId/dialogue", async (req, res) => {
  try {
    const npcId = validateNpcId(req.params.npcId);
    if (!npcId) {
      return res.status(400).json({ error: "npcId must be a valid positive integer." });
    }

    const user = await getRequestUser(req);
    const npc = await prisma.npc.findUnique({ where: { id: npcId } });

    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    // Players can only see visible NPCs
    if ((!user || user.role !== "DM") && !npc.isVisibleToPlayers) {
      return res.status(403).json({ error: "You do not have permission to view this NPC." });
    }

    const dialogueTree = safeJsonParse(npc.dialogueTree, { startNodeId: null, nodes: [] });

    res.json({ dialogueTree, npcName: npc.name });
  } catch (err) {
    logger.error("api:route", "Error in GET /api/npcs/:npcId/dialogue", { error: err.message });
    res.status(500).json({ error: "Failed to fetch dialogue tree." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/npcs/:npcId/dialogue  Update/replace full dialogue tree (DM only)
// ---------------------------------------------------------------------------
router.put("/:npcId/dialogue", requireDm, async (req, res) => {
  try {
    const npcId = validateNpcId(req.params.npcId);
    if (!npcId) {
      return res.status(400).json({ error: "npcId must be a valid positive integer." });
    }

    const npc = await prisma.npc.findUnique({ where: { id: npcId } });
    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    const { dialogueTree } = req.body;

    if (!dialogueTree || typeof dialogueTree !== "object") {
      return res.status(400).json({ error: "dialogueTree must be a valid JSON object." });
    }

    // Validate structure
    if (!dialogueTree.startNodeId || !Array.isArray(dialogueTree.nodes)) {
      return res.status(400).json({ error: "dialogueTree must have a startNodeId and a nodes array." });
    }

    const updated = await prisma.npc.update({
      where: { id: npcId },
      data: { dialogueTree: JSON.stringify(dialogueTree) },
    });

    logger.info("api:dialogue", "Dialogue tree updated", { npcId, nodeCount: dialogueTree.nodes.length });

    res.json({
      message: "Dialogue tree updated successfully.",
      dialogueTree,
      npcName: updated.name,
    });
  } catch (err) {
    logger.error("api:route", "Error in PUT /api/npcs/:npcId/dialogue", { error: err.message });
    res.status(500).json({ error: "Failed to update dialogue tree." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/npcs/:npcId/dialogue/start  Start dialogue, returns start node
// ---------------------------------------------------------------------------
router.post("/:npcId/dialogue/start", async (req, res) => {
  try {
    const npcId = validateNpcId(req.params.npcId);
    if (!npcId) {
      return res.status(400).json({ error: "npcId must be a valid positive integer." });
    }

    const user = await getRequestUser(req);
    const npc = await prisma.npc.findUnique({ where: { id: npcId } });

    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    if ((!user || user.role !== "DM") && !npc.isVisibleToPlayers) {
      return res.status(403).json({ error: "You do not have permission to interact with this NPC." });
    }

    const dialogueTree = safeJsonParse(npc.dialogueTree, { startNodeId: null, nodes: [] });
    const startNode = getStartNode(dialogueTree);

    if (!startNode) {
      return res.status(400).json({ error: "Dialogue tree has no valid start node." });
    }

    // Broadcast dialogue:start via Socket.io
    const io = req.app.get("io");
    if (io) {
      io.emit("dialogue:start", {
        npcId,
        npcName: npc.name,
        startNode,
      });
    }

    res.json({
      npcId,
      npcName: npc.name,
      node: startNode,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/npcs/:npcId/dialogue/start", { error: err.message });
    res.status(500).json({ error: "Failed to start dialogue." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/npcs/:npcId/dialogue/advance  Advance to next node
// Body: { nodeId, choiceIndex?, rollResult?, context? }
// ---------------------------------------------------------------------------
router.post("/:npcId/dialogue/advance", async (req, res) => {
  try {
    const npcId = validateNpcId(req.params.npcId);
    if (!npcId) {
      return res.status(400).json({ error: "npcId must be a valid positive integer." });
    }

    const user = await getRequestUser(req);
    const npc = await prisma.npc.findUnique({ where: { id: npcId } });

    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    if ((!user || user.role !== "DM") && !npc.isVisibleToPlayers) {
      return res.status(403).json({ error: "You do not have permission to interact with this NPC." });
    }

    const { nodeId, choiceIndex, rollResult, context } = req.body;

    if (!nodeId || typeof nodeId !== "string") {
      return res.status(400).json({ error: "nodeId (string) is required." });
    }

    const dialogueTree = safeJsonParse(npc.dialogueTree, { startNodeId: null, nodes: [] });
    const node = resolveNode(dialogueTree, nodeId);

    if (!node) {
      return res.status(404).json({ error: `Node '${nodeId}' not found in dialogue tree.` });
    }

    let nextNode = null;
    let messages = [];

    switch (node.type) {
      case "SPEECH":
      case "ACTION": {
        // For ACTION nodes, execute the action
        if (node.type === "ACTION") {
          const result = executeAction(node.actionType, node.actionPayload, context);
          messages.push(result.message);
        }
        if (node.nextNodeId) {
          nextNode = resolveNode(dialogueTree, node.nextNodeId);
        }
        break;
      }

      case "CHOICE": {
        if (choiceIndex === undefined || choiceIndex === null) {
          return res.status(400).json({ error: "choiceIndex is required for CHOICE nodes." });
        }
        const choices = node.choices || [];
        const selected = choices[choiceIndex];
        if (!selected) {
          return res.status(400).json({ error: `Invalid choiceIndex ${choiceIndex}.` });
        }
        if (selected.nextNodeId) {
          nextNode = resolveNode(dialogueTree, selected.nextNodeId);
        }
        messages.push(`Selected: "${selected.text}"`);
        break;
      }

      case "CONDITION": {
        const conditionCtx = { ...(context || {}), roll: rollResult || 0 };
        const conditionMet = evaluateCondition(node.condition, conditionCtx);
        const targetNodeId = conditionMet ? node.trueNextNodeId : node.falseNextNodeId;
        messages.push(conditionMet ? "Condition met." : "Condition not met.");
        if (targetNodeId) {
          nextNode = resolveNode(dialogueTree, targetNodeId);
        }
        break;
      }

      case "SKILL_CHECK": {
        const skillRoll = rollResult !== undefined ? rollResult : 10; // default roll if not provided
        const passed = skillRoll >= (node.dc || 10);
        const targetNodeId = passed ? node.successNodeId : node.failureNodeId;
        messages.push(`${node.skill || "Skill"} check: rolled ${skillRoll} vs DC ${node.dc || 10} — ${passed ? "Success!" : "Failure."}`);
        if (targetNodeId) {
          nextNode = resolveNode(dialogueTree, targetNodeId);
        }
        break;
      }

      case "RANDOM": {
        const selectedChoice = pickWeightedRandom(node.choices);
        if (selectedChoice && selectedChoice.nextNodeId) {
          nextNode = resolveNode(dialogueTree, selectedChoice.nextNodeId);
        }
        messages.push("Random choice resolved.");
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown node type: ${node.type}` });
    }

    // Broadcast dialogue:advance via Socket.io
    const io = req.app.get("io");
    if (io && nextNode) {
      io.emit("dialogue:advance", {
        npcId,
        node: nextNode,
        messages,
      });
    }

    res.json({
      npcId,
      npcName: npc.name,
      previousNode: node,
      nextNode,
      messages,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/npcs/:npcId/dialogue/advance", { error: err.message });
    res.status(500).json({ error: "Failed to advance dialogue." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/npcs/:npcId/dialogue/evaluate  Server-side condition evaluation (DM only)
// Body: { nodeId, context? }
// ---------------------------------------------------------------------------
router.post("/:npcId/dialogue/evaluate", requireDm, async (req, res) => {
  try {
    const npcId = validateNpcId(req.params.npcId);
    if (!npcId) {
      return res.status(400).json({ error: "npcId must be a valid positive integer." });
    }

    const npc = await prisma.npc.findUnique({ where: { id: npcId } });
    if (!npc) {
      return res.status(404).json({ error: "NPC not found." });
    }

    const { nodeId, context } = req.body;

    if (!nodeId || typeof nodeId !== "string") {
      return res.status(400).json({ error: "nodeId (string) is required." });
    }

    const dialogueTree = safeJsonParse(npc.dialogueTree, { startNodeId: null, nodes: [] });
    const node = resolveNode(dialogueTree, nodeId);

    if (!node) {
      return res.status(404).json({ error: `Node '${nodeId}' not found in dialogue tree.` });
    }

    let result;

    switch (node.type) {
      case "CONDITION":
        result = {
          nodeId,
          condition: node.condition,
          evaluated: evaluateCondition(node.condition, context),
          trueNextNodeId: node.trueNextNodeId,
          falseNextNodeId: node.falseNextNodeId,
        };
        break;

      case "SKILL_CHECK":
        result = {
          nodeId,
          skill: node.skill,
          dc: node.dc,
          context,
        };
        break;

      case "ACTION": {
        const actionResult = executeAction(node.actionType, node.actionPayload, context);
        result = {
          nodeId,
          actionType: node.actionType,
          actionPayload: node.actionPayload,
          result: actionResult,
        };
        break;
      }

      default:
        result = {
          nodeId,
          type: node.type,
          note: "No server-side evaluation needed for this node type.",
        };
    }

    res.json(result);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/npcs/:npcId/dialogue/evaluate", { error: err.message });
    res.status(500).json({ error: "Failed to evaluate dialogue condition." });
  }
});

module.exports = router;
