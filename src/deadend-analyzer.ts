import { IntGrid } from './data-structures';

export type Pos = [number, number];

export interface AnalyzerContext {
  PATH_TILE: number;
  REGION_TILE: number;
  levelSize: [number, number];
  inBounds(pos: Pos): boolean;
  getNeighbors(pos: Pos): Pos[];
  wouldCreateDoubleWideAt(pos: Pos, intGrid: IntGrid): boolean;
}

function getPathNeighbors(pos: Pos, intGrid: IntGrid, ctx: AnalyzerContext): Pos[] {
  const res: Pos[] = [];
  for (const n of ctx.getNeighbors(pos)) {
    if (
      n[0] >= 0 && n[0] < ctx.levelSize[0] &&
      n[1] >= 0 && n[1] < ctx.levelSize[1] &&
      intGrid.getTile(n[0], n[1]) === ctx.PATH_TILE
    ) {
      res.push(n);
    }
  }
  return res;
}

function countPathConnections(pos: Pos, intGrid: IntGrid, ctx: AnalyzerContext, exclude: Set<string> = new Set()): number {
  let count = 0;
  for (const n of ctx.getNeighbors(pos)) {
    const key = `${n[0]},${n[1]}`;
    if (exclude.has(key)) continue;
    if (
      n[0] >= 0 && n[0] < ctx.levelSize[0] &&
      n[1] >= 0 && n[1] < ctx.levelSize[1] &&
      intGrid.getTile(n[0], n[1]) === ctx.PATH_TILE
    ) {
      count++;
    }
  }
  return count;
}

function detectDeadEnds(intGrid: IntGrid, ctx: AnalyzerContext): Pos[] {
  const tips: Pos[] = [];
  for (let x = 0; x < ctx.levelSize[0]; x++) {
    for (let y = 0; y < ctx.levelSize[1]; y++) {
      if (intGrid.getTile(x, y) !== ctx.PATH_TILE) continue;
      if (countPathConnections([x, y], intGrid, ctx) === 1) {
        tips.push([x, y]);
      }
    }
  }
  return tips;
}

function getDeadEndDirection(tip: Pos, intGrid: IntGrid, ctx: AnalyzerContext): Pos | null {
  const neighbors = getPathNeighbors(tip, intGrid, ctx);
  if (neighbors.length !== 1) return null;
  const n = neighbors[0];
  return [tip[0] - n[0], tip[1] - n[1]] as Pos;
}

const TIER1_MIN_EXTENSION = 50;
const TIER3_SEARCH_RADIUS = 40;

function tryBranchFrom(origin: Pos, forwardDir: Pos, intGrid: IntGrid, ctx: AnalyzerContext, maxSteps: number): boolean {
  const perps: Pos[] = (forwardDir[0] !== 0) ? [[0,1],[0,-1]] : [[1,0],[-1,0]];
  if (Math.random() < 0.5) perps.reverse();

  for (const dir of perps) {
    let curr: Pos = [origin[0] + dir[0], origin[1] + dir[1]];
    const branch: Pos[] = [];
    for (let i = 0; i < maxSteps; i++) {
      if (!ctx.inBounds(curr)) break;
      const t = intGrid.getTile(curr[0], curr[1]);
      if (t === ctx.PATH_TILE) {
        for (const p of branch) intGrid.setTile(p[0], p[1], ctx.PATH_TILE);
        return true;
      }
      if (ctx.wouldCreateDoubleWideAt(curr, intGrid)) break;
      branch.push([curr[0], curr[1]]);
      curr = [curr[0] + dir[0], curr[1] + dir[1]];
    }
  }
  return false;
}

function tryExtendCorridor(tip: Pos, intGrid: IntGrid, ctx: AnalyzerContext): boolean {
  const dir = getDeadEndDirection(tip, intGrid, ctx);
  if (!dir) return false;

  const pathToPlace: Pos[] = [];
  let connected = false;
  let current: Pos = [tip[0] + dir[0], tip[1] + dir[1]];

  for (let step = 1; step <= TIER1_MIN_EXTENSION; step++) {
    if (!ctx.inBounds(current)) break;

    const tile = intGrid.getTile(current[0], current[1]);
    if (tile === ctx.PATH_TILE) {
      connected = true;
      break;
    }

    if (ctx.wouldCreateDoubleWideAt(current, intGrid)) break;

    pathToPlace.push([current[0], current[1]]);

    if (!connected && Math.random() < 0.12) {
      const branched = tryBranchFrom(current, dir, intGrid, ctx, 20 + Math.floor(Math.random() * 15));
      if (branched) {
        connected = true;
      }
    }

    current = [current[0] + dir[0], current[1] + dir[1]];
  }

  for (const p of pathToPlace) {
    if (ctx.inBounds(p)) intGrid.setTile(p[0], p[1], ctx.PATH_TILE);
  }
  return connected;
}

function pruneShortDeadEnd(tip: Pos, intGrid: IntGrid, ctx: AnalyzerContext, minLen: number, maxLen: number): boolean {
  const inward = getPathNeighbors(tip, intGrid, ctx);
  if (inward.length !== 1) return false;

  const corridor: Pos[] = [tip];
  let prev: Pos = tip;
  let curr: Pos = inward[0];

  while (true) {
    corridor.push(curr);
    const nbs = getPathNeighbors(curr, intGrid, ctx);
    if (nbs.length !== 2) break;
    const next = (nbs[0][0] === prev[0] && nbs[0][1] === prev[1]) ? nbs[1] : nbs[0];
    prev = curr;
    curr = next;
    if (!ctx.inBounds(curr) || corridor.length > 1000) break;
  }

  if (corridor.length >= minLen && corridor.length <= maxLen) {
    for (const p of corridor) intGrid.setTile(p[0], p[1], ctx.REGION_TILE);
    return true;
  }
  return false;
}

function forceConnectDeadEnd(tip: Pos, intGrid: IntGrid, ctx: AnalyzerContext, findPathSegment: (start: Pos, end: Pos, grid: IntGrid) => Pos[] | null): boolean {
  const neighbors: Pos[] = [];
  for (const n of ctx.getNeighbors(tip)) {
    if (!ctx.inBounds(n)) continue;
    if (intGrid.getTile(n[0], n[1]) === ctx.PATH_TILE) neighbors.push(n);
  }
  if (neighbors.length !== 1) return false;
  const backDir: Pos = [neighbors[0][0] - tip[0], neighbors[0][1] - tip[1]];

  const dirs = ([[1,0],[-1,0],[0,1],[0,-1]] as Pos[]).filter(d => !(d[0] === backDir[0] && d[1] === backDir[1]));

  let bestTarget: Pos | null = null;
  let bestDist = Number.MAX_SAFE_INTEGER;

  for (const d of dirs) {
    let curr: Pos = [tip[0] + d[0], tip[1] + d[1]];
    for (let step = 1; step <= TIER3_SEARCH_RADIUS; step++) {
      if (!ctx.inBounds(curr)) break;
      if (intGrid.getTile(curr[0], curr[1]) === ctx.PATH_TILE) {
        const dist = Math.abs(curr[0] - tip[0]) + Math.abs(curr[1] - tip[1]);
        if (dist < bestDist) { bestDist = dist; bestTarget = [curr[0], curr[1]]; }
        break;
      }
      curr = [curr[0] + d[0], curr[1] + d[1]];
    }
  }

  if (!bestTarget) {
    const neighbor = neighbors[0];
    for (let x = 0; x < ctx.levelSize[0]; x++) {
      for (let y = 0; y < ctx.levelSize[1]; y++) {
        if (intGrid.getTile(x, y) !== ctx.PATH_TILE) continue;
        if (neighbor && x === neighbor[0] && y === neighbor[1]) continue;
        const dist = Math.abs(x - tip[0]) + Math.abs(y - tip[1]);
        if (dist < bestDist) { bestDist = dist; bestTarget = [x, y]; }
      }
    }
  }

  if (!bestTarget) return false;

  const path = findPathSegment(tip, bestTarget, intGrid);
  if (!path || path.length === 0) return false;

  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (ctx.wouldCreateDoubleWideAt(p, intGrid)) break;
    intGrid.setTile(p[0], p[1], ctx.PATH_TILE);
  }
  return true;
}

export function analyzeAndFixDeadEnds(intGrid: IntGrid, ctx: AnalyzerContext, findPathSegment: (start: Pos, end: Pos, grid: IntGrid) => Pos[] | null, fixDoubleWide: (grid: IntGrid) => void) {
  const maxPasses = 5;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    const deadEnds = detectDeadEnds(intGrid, ctx);
    if (deadEnds.length === 0) break;

    for (const tip of deadEnds) {
      if (tryExtendCorridor(tip, intGrid, ctx)) {
        changed = true;
      }
    }

    fixDoubleWide(intGrid);

    const deadEndsAfterT1 = detectDeadEnds(intGrid, ctx);
    for (const tip of deadEndsAfterT1) {
      if (pruneShortDeadEnd(tip, intGrid, ctx, 1, 5)) {
        changed = true;
      }
    }

    fixDoubleWide(intGrid);

    const deadEndsAfterT2 = detectDeadEnds(intGrid, ctx);
    for (const tip of deadEndsAfterT2) {
      if (forceConnectDeadEnd(tip, intGrid, ctx, findPathSegment)) {
        changed = true;
      }
    }

    fixDoubleWide(intGrid);

    if (!changed) break;
  }
}
