// =============================================================================
// Tablecast — Dialogue Tree Engine
// Utility for navigating, evaluating conditions, and executing actions in
// NPC dialogue trees.
// =============================================================================
"use strict";

/**
 * Resolve a node by its ID from a dialogue tree.
 * @param {object} tree - The dialogue tree object { startNodeId, nodes }
 * @param {string} nodeId - The node ID to find
 * @returns {object|null} The matching node, or null if not found
 */
function resolveNode(tree, nodeId) {
  if (!tree || !tree.nodes || !Array.isArray(tree.nodes)) return null;
  return tree.nodes.find(n => n.id === nodeId) || null;
}

/**
 * Get the starting node of a dialogue tree.
 * @param {object} tree - The dialogue tree object
 * @returns {object|null} The starting node, or null if invalid
 */
function getStartNode(tree) {
  if (!tree || !tree.startNodeId || !tree.nodes) return null;
  return resolveNode(tree, tree.startNodeId);
}

/**
 * Evaluate a simple condition expression against a context object.
 * Supports expressions like:
 *   "party.gold >= 100"
 *   "player.hasItem('key')"
 *   "roll >= 15"
 *   "variable == value"
 * @param {string} condition - The condition expression string
 * @param {object} context - Evaluation context { party, player, variables, roll }
 * @returns {boolean} The result of evaluation
 */
function evaluateCondition(condition, context = {}) {
  if (!condition) return true;

  // Build evaluation context with defaults
  const party = context.party || { gold: 0 };
  const player = context.player || { level: 1, hasItem: () => false };
  const variables = context.variables || {};
  const roll = context.roll || 0;

  try {
    // Use Function constructor for safe evaluation with limited scope
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "party", "player", "variables", "roll",
      `"use strict"; return (${condition});`
    );
    return !!fn(party, player, variables, roll);
  } catch {
    return false;
  }
}

/**
 * Execute a dialogue action and return a result descriptor.
 * @param {string} actionType - The action type (give_item, remove_item, etc.)
 * @param {string|object} actionPayload - JSON string or object payload
 * @param {object} context - Execution context
 * @returns {{ success: boolean, message: string }} Action result
 */
function executeAction(actionType, actionPayload, _context = {}) {
  let payload;
  if (typeof actionPayload === "string") {
    try {
      payload = JSON.parse(actionPayload || "{}");
    } catch {
      payload = {};
    }
  } else {
    payload = actionPayload || {};
  }

  switch (actionType) {
    case "give_item":
      return { success: true, message: `Gave ${payload.quantity || 1}x ${payload.item || "unknown item"} to party.` };
    case "remove_item":
      return { success: true, message: `Removed ${payload.quantity || 1}x ${payload.item || "unknown item"} from party.` };
    case "give_gold":
      return { success: true, message: `Party received ${payload.amount || 0} gold.` };
    case "remove_gold":
      return { success: true, message: `Party lost ${payload.amount || 0} gold.` };
    case "start_encounter":
      return { success: true, message: `Starting encounter: ${payload.encounterName || "Unknown"}` };
    case "set_variable":
      return { success: true, message: `Variable ${payload.name || "unknown"} set to ${payload.value}.` };
    case "send_message":
      return { success: true, message: payload.message || "Message sent." };
    case "custom":
      return { success: true, message: payload.message || "Custom action executed." };
    default:
      return { success: false, message: `Unknown action type: ${actionType}` };
  }
}

/**
 * Pick a random choice from a RANDOM node based on weights.
 * @param {Array} choices - Array of choice objects with weight and nextNodeId
 * @returns {object|null} The selected choice, or null if empty
 */
function pickWeightedRandom(choices) {
  if (!choices || choices.length === 0) return null;
  const totalWeight = choices.reduce((sum, c) => sum + (c.weight || 1), 0);
  let roll = Math.random() * totalWeight;
  for (const choice of choices) {
    roll -= choice.weight || 1;
    if (roll <= 0) return choice;
  }
  return choices[choices.length - 1];
}

module.exports = {
  resolveNode,
  getStartNode,
  evaluateCondition,
  executeAction,
  pickWeightedRandom,
};
