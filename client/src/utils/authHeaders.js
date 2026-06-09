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
