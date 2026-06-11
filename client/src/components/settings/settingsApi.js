// =============================================================================
// Tablecast — Settings Panel API Helpers
// Pure data-fetching functions for the DM Settings panel.
// Each function accepts authHeaders and returns the parsed response data.
// =============================================================================

/**
 * Fetch reference data cache status from the server.
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} Reference status object or null on failure.
 */
export async function fetchRefStatus(authHeaders) {
  const res = await fetch("/api/reference/status");
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch the current backup configuration (rclone config, remote, path).
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} Backup config object or null on failure.
 */
export async function fetchBackupConfig(authHeaders) {
  const res = await fetch("/api/backup/config", { headers: authHeaders });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch available rclone storage providers (Google Drive, Dropbox, S3, etc.).
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} Object with providers array or null on failure.
 */
export async function fetchProviders(authHeaders) {
  const res = await fetch("/api/backup/providers", { headers: authHeaders });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch the list of configured rclone remotes.
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} Object with remotes array or null on failure.
 */
export async function fetchConfiguredRemotes(authHeaders) {
  const res = await fetch("/api/backup/remotes", { headers: authHeaders });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch the backup status for a given remote destination.
 * @param {Object} authHeaders - Auth headers for the request.
 * @param {string} remoteName - rclone remote name (e.g. "gdrive").
 * @param {string} remotePath - Path within the remote (e.g. "tablecast-backups").
 * @returns {Promise<Object|null>} Backup status object or null on failure.
 */
export async function fetchBackupStatus(authHeaders, remoteName, remotePath) {
  const fullRemote = `${remoteName}:${remotePath}`;
  const res = await fetch(`/api/backup/status?remote=${encodeURIComponent(fullRemote.trim())}`, {
    headers: authHeaders,
  });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch reference data settings (allowed sources, available sources).
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} Reference settings object or null on failure.
 */
export async function fetchReferenceSettings(authHeaders) {
  const res = await fetch("/api/reference/settings");
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Fetch the current AI provider settings.
 * @param {Object} authHeaders - Auth headers for the request.
 * @returns {Promise<Object|null>} AI settings object or null on failure.
 */
export async function fetchAiSettings(authHeaders) {
  const res = await fetch("/api/ai/settings", { headers: authHeaders });
  if (res.ok) {
    return await res.json();
  }
  return null;
}
