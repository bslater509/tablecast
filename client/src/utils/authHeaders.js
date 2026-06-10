/**
 * Generate the correct auth headers for API calls based on user identity.
 *
 * For players (character auth): sends x-tablecast-character-id
 * For DM (user auth):         sends x-tablecast-user-id
 *
 * Usage:
 *   const authHeaders = getAuthHeaders(user);
 *   fetch("/api/chat", { headers: { ...authHeaders, "Content-Type": "application/json" } });
 *
 * @param {object|null} user - The current logged-in user/identity object
 * @param {string} [contentType] - Optional Content-Type header value
 * @returns {object} Headers object
 */
export function getAuthHeaders(user, contentType) {
  if (!user) return {};

  const headers = {};

  if (user.isCharacter) {
    headers["x-tablecast-character-id"] = String(user.id);
  } else {
    headers["x-tablecast-user-id"] = String(user.id);
  }

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

/**
 * Get JSON auth headers (includes Content-Type: application/json).
 * @param {object|null} user
 * @returns {object}
 */
export function getJsonAuthHeaders(user) {
  return getAuthHeaders(user, "application/json");
}

/**
 * Whether the current identity may access a character record or token link.
 * Heroes (standalone characters) have userId null — match by character id.
 */
export function canAccessCharacter(character, user) {
  if (!character || !user) return false;
  if (user.role === "DM") return true;
  if (user.isCharacter) return character.id === user.id;
  return character.userId === user.id;
}

/**
 * Whether the current identity may drag a map token.
 */
export function canMoveToken(token, user, isDM) {
  if (isDM) return true;
  if (!token || !user) return false;
  if (user.isCharacter) return token.characterId === user.id;
  return token.character?.userId === user.id;
}

/**
 * Whether a chat message was sent by the current identity.
 */
export function isOwnMessage(msg, user) {
  if (!msg || !user) return false;
  if (user.isCharacter) {
    return msg.characterId != null && msg.characterId === user.id;
  }
  return msg.userId != null && msg.userId === user.id;
}
