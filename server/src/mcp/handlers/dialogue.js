// =============================================================================
// Tablecast MCP — Dialogue Tree Tool Handlers
// =============================================================================
"use strict";

const {
  resolveNode,
  getStartNode,
  evaluateCondition,
  executeAction,
  pickWeightedRandom,
} = require("../../utils/dialogueEngine");

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleGetNpcDialogue(args, { prisma, logError }) {
  const npcId = Number(args.npcId);
  if (!Number.isInteger(npcId) || npcId < 1) {
    throw new Error("npcId must be a positive integer.");
  }

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    throw new Error(`NPC with ID ${npcId} not found.`);
  }

  let dialogueTree = { startNodeId: null, nodes: [] };
  try {
    dialogueTree = JSON.parse(npc.dialogueTree || "{}");
  } catch {
    dialogueTree = { startNodeId: null, nodes: [] };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ npcId, npcName: npc.name, dialogueTree }, null, 2) }],
  };
}

// eslint-disable-next-line unused-imports/no-unused-vars
async function handleUpdateNpcDialogue(args, { prisma, logError }) {
  const npcId = Number(args.npcId);
  if (!Number.isInteger(npcId) || npcId < 1) {
    throw new Error("npcId must be a positive integer.");
  }

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    throw new Error(`NPC with ID ${npcId} not found.`);
  }

  const { dialogueTree } = args;
  if (!dialogueTree || typeof dialogueTree !== "object") {
    throw new Error("dialogueTree must be a valid JSON object.");
  }

  if (!dialogueTree.startNodeId || !Array.isArray(dialogueTree.nodes)) {
    throw new Error("dialogueTree must have a startNodeId and a nodes array.");
  }

  const updated = await prisma.npc.update({
    where: { id: npcId },
    data: { dialogueTree: JSON.stringify(dialogueTree) },
  });

  return {
    content: [{
      type: "text",
      text: `Dialogue tree updated for NPC '${updated.name}' (ID: ${npcId}). Node count: ${dialogueTree.nodes.length}.`,
    }],
  };
}

async function handleStartNpcDialogue(args, { prisma, getIo, logError }) {
  const npcId = Number(args.npcId);
  if (!Number.isInteger(npcId) || npcId < 1) {
    throw new Error("npcId must be a positive integer.");
  }

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    throw new Error(`NPC with ID ${npcId} not found.`);
  }

  let dialogueTree = { startNodeId: null, nodes: [] };
  try {
    dialogueTree = JSON.parse(npc.dialogueTree || "{}");
  } catch {
    dialogueTree = { startNodeId: null, nodes: [] };
  }

  const startNode = getStartNode(dialogueTree);
  if (!startNode) {
    throw new Error("Dialogue tree has no valid start node.");
  }

  // Broadcast dialogue:start via Socket.io
  try {
    const io = getIo();
    if (io) {
      io.emit("dialogue:start", { npcId, npcName: npc.name, startNode });
    }
  } catch (err) {
    logError("Failed to broadcast dialogue:start:", err.message);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ npcId, npcName: npc.name, node: startNode }, null, 2),
    }],
  };
}

async function handleAdvanceNpcDialogue(args, { prisma, getIo, logError }) {
  const npcId = Number(args.npcId);
  if (!Number.isInteger(npcId) || npcId < 1) {
    throw new Error("npcId must be a positive integer.");
  }

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    throw new Error(`NPC with ID ${npcId} not found.`);
  }

  const { nodeId, choiceIndex, rollResult, context } = args;
  if (!nodeId || typeof nodeId !== "string") {
    throw new Error("nodeId (string) is required.");
  }

  let dialogueTree = { startNodeId: null, nodes: [] };
  try {
    dialogueTree = JSON.parse(npc.dialogueTree || "{}");
  } catch {
    dialogueTree = { startNodeId: null, nodes: [] };
  }

  const node = resolveNode(dialogueTree, nodeId);
  if (!node) {
    throw new Error(`Node '${nodeId}' not found in dialogue tree.`);
  }

  let nextNode = null;
  const messages = [];

  switch (node.type) {
    case "SPEECH":
    case "ACTION": {
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
        throw new Error("choiceIndex is required for CHOICE nodes.");
      }
      const choices = node.choices || [];
      const selected = choices[choiceIndex];
      if (!selected) {
        throw new Error(`Invalid choiceIndex ${choiceIndex}.`);
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
      const skillRoll = rollResult !== undefined ? rollResult : 10;
      const passed = skillRoll >= (node.dc || 10);
      const targetNodeId = passed ? node.successNodeId : node.failureNodeId;
      messages.push(
        `${node.skill || "Skill"} check: rolled ${skillRoll} vs DC ${node.dc || 10} — ${passed ? "Success!" : "Failure."}`
      );
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
      throw new Error(`Unknown node type: ${node.type}`);
  }

  // Broadcast dialogue:advance via Socket.io
  try {
    const io = getIo();
    if (io && nextNode) {
      io.emit("dialogue:advance", { npcId, node: nextNode, messages });
    }
  } catch (err) {
    logError("Failed to broadcast dialogue:advance:", err.message);
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ npcId, npcName: npc.name, previousNode: node, nextNode, messages }, null, 2),
    }],
  };
}

module.exports = {
  handleGetNpcDialogue,
  handleUpdateNpcDialogue,
  handleStartNpcDialogue,
  handleAdvanceNpcDialogue,
};
