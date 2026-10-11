function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeBounds(bounds, width, height) {
  const x = integer(bounds?.x);
  const y = integer(bounds?.y);
  const boxWidth = integer(bounds?.width);
  const boxHeight = integer(bounds?.height);
  if (x === null || y === null || boxWidth === null || boxHeight === null
    || boxWidth < 1 || boxHeight < 1) return null;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(width, x + boxWidth);
  const bottom = Math.min(height, y + boxHeight);
  if (right <= left || bottom <= top) return null;
  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

function contains(outer, inner) {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height;
}

export function verifyVisualCoverage({
  width,
  height,
  requiredRegions,
  appliedMasks,
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError("Coverage dimensions are invalid.");
  }
  if (!Array.isArray(requiredRegions) || !Array.isArray(appliedMasks)) {
    throw new TypeError("Coverage regions and applied masks are required.");
  }

  const normalizedMasks = appliedMasks.flatMap((mask) => {
    if (mask?.applied !== true || mask?.mode !== "opaque" || typeof mask?.regionId !== "string") return [];
    const bounds = normalizeBounds(mask.bounds, width, height);
    return bounds ? [{ regionId: mask.regionId, bounds }] : [];
  });
  const uncoveredRegionIds = [];
  let coveredCount = 0;

  for (const region of requiredRegions) {
    const bounds = normalizeBounds(region?.bounds, width, height);
    if (typeof region?.regionId !== "string" || !bounds) {
      throw new TypeError("A required sensitive region is invalid.");
    }
    const covered = normalizedMasks.some((mask) => (
      mask.regionId === region.regionId && contains(mask.bounds, bounds)
    ));
    if (covered) coveredCount += 1;
    else uncoveredRegionIds.push(region.regionId);
  }

  return Object.freeze({
    ok: uncoveredRegionIds.length === 0,
    requiredCount: requiredRegions.length,
    coveredCount,
    uncoveredRegionIds: Object.freeze(uncoveredRegionIds),
  });
}
