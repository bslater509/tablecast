// =============================================================================
// Dynamic Lighting & Line-of-Sight — Raycasting Engine
// Computes visible polygons from token positions given wall segments.
// =============================================================================

/**
 * Parse walls JSON into array of {x1,y1,x2,y2} segments.
 */
export function parseWalls(wallsJson) {
  try {
    return JSON.parse(wallsJson || "[]");
  } catch {
    return [];
  }
}

/**
 * Compute the visible polygon from a given origin point, constrained by
 * wall segments and a maximum vision radius.
 *
 * Uses a raycasting approach: casts N rays evenly around the origin,
 * finds the nearest wall intersection for each, and returns a polygon.
 *
 * @param {number} ox - Origin x (pixel position)
 * @param {number} oy - Origin y (pixel position)
 * @param {Array} walls - Array of {x1,y1,x2,y2} wall segments
 * @param {number} radius - Maximum vision radius in pixels
 * @param {number} [numRays=64] - Number of rays to cast
 * @returns {Array} Array of {x,y} points forming the visible polygon
 */
export function computeVisibility(ox, oy, walls, radius, numRays = 64) {
  if (radius <= 0) return null;

  const polygon = [];
  const angleStep = (Math.PI * 2) / numRays;

  for (let i = 0; i < numRays; i++) {
    const angle = i * angleStep;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Ray from origin in this direction
    let closestDist = radius;
    let hitWall = false;

    for (const wall of walls) {
      const intersection = raySegmentIntersect(ox, oy, dx, dy, wall);
      if (intersection !== null && intersection.t < closestDist && intersection.t > 0.01) {
        closestDist = intersection.t;
        hitWall = true;
      }
    }

    const endX = ox + dx * closestDist;
    const endY = oy + dy * closestDist;

    // Slightly nudge endpoints near walls for clean rendering
    if (hitWall) {
      polygon.push({ x: endX, y: endY });
    } else {
      polygon.push({ x: endX, y: endY });
    }
  }

  return polygon;
}

/**
 * Ray-segment intersection test.
 * Ray: origin (ox, oy) + t * (dx, dy), t >= 0
 * Segment: (x1,y1) -> (x2,y2)
 * Returns { t } if intersection found, null otherwise.
 */
function raySegmentIntersect(ox, oy, dx, dy, wall) {
  const { x1, y1, x2, y2 } = wall;
  const sx = x2 - x1;
  const sy = y2 - y1;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;

  if (t >= 0 && u >= 0 && u <= 1) {
    return { t };
  }

  return null;
}

/**
 * Check if a point is within a wall-enclosed area (simple ray casting).
 * Used for determining if a token is in a "dark" area.
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Combine multiple visibility polygons into a single path for canvas rendering.
 * Uses a simple union approach: for canvas, we can just draw each polygon
 * using "destination-out" compositing on a dark overlay.
 */
export function combineVisibilityPolygons(polygons) {
  // Filter out null/empty polygons
  return polygons.filter(p => p && p.length >= 3);
}

/**
 * Compute vision for all relevant tokens on a map.
 *
 * @param {Array} tokens - Array of token objects
 * @param {Array} walls - Array of wall segments {x1,y1,x2,y2}
 * @param {number} gridSize - Grid cell size in pixels
 * @returns {Array} Array of {x,y}[] visibility polygons
 */
export function computeAllVision(tokens, walls, gridSize) {
  const visionPolygons = [];
  for (const token of tokens) {
    const visionRadius = Number(token.visionRadius) || 0;
    const darkvisionRadius = Number(token.darkvisionRadius) || 0;
    const effectiveRadius = Math.max(visionRadius, darkvisionRadius);
    if (effectiveRadius > 0) {
      const tx = (token.x + 0.5) * gridSize;
      const ty = (token.y + 0.5) * gridSize;
      const polygon = computeVisibility(tx, ty, walls, effectiveRadius);
      if (polygon) visionPolygons.push(polygon);
    }
  }
  return combineVisibilityPolygons(visionPolygons);
}
