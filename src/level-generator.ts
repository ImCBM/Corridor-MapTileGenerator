import Delaunator from 'delaunator';
import { Point, Edge, PathNode, IntGrid } from './data-structures';
// Dead-end analysis moved to its own module
import { analyzeAndFixDeadEnds as runDeadEndAnalyzer, AnalyzerContext } from './deadend-analyzer';

export class HeIsComingGenerator {
    public levelSize: [number, number] = [50, 50];
    public regionCount: number = 15;
    public minRegionDistance: number = 4;

    // Tile types
    public readonly PATH_TILE = 1;
    public readonly REGION_TILE = 2;
    public readonly REGION_CENTER_TILE = 3;

    public edges: Edge[] = [];

    generateLayout(): IntGrid {
        this.edges = [];

        // Generate region points
        const points = this.generateRegionPoints();

        // Create Delaunay triangulation
        if (points.length < 3) {
            throw new Error('Need at least 3 points for triangulation');
        }

        // Convert points to coordinate array for delaunator
        const coords: number[] = [];
        points.forEach(p => {
            coords.push(p.x, p.y);
        });

        const delaunay = new Delaunator(coords);

        // Create grid
        const intGrid = new IntGrid(this.levelSize[0], this.levelSize[1]);

        // Initialize grid with region tiles
        for (let x = 0; x < this.levelSize[0]; x++) {
            for (let y = 0; y < this.levelSize[1]; y++) {
                intGrid.setTile(x, y, this.REGION_TILE);
            }
        }

        // Get edges from Delaunay triangulation
        const edges = this.getDelaunayEdges(delaunay, points);

        // Sort edges by length (shorter first)
        edges.sort((a, b) => this.edgeLength(a) - this.edgeLength(b));

        // Process edges and create paths
        for (const edge of edges) {
            this.edges.push(edge);
            const point1: [number, number] = [Math.floor(edge.p.x), Math.floor(edge.p.y)];
            const point2: [number, number] = [Math.floor(edge.q.x), Math.floor(edge.q.y)];

            // Find path between points using A*
            const path = this.findPath(point1, point2, intGrid);

            // Place path tiles
            if (path) {
                for (const pathPoint of path) {
                    intGrid.setTile(pathPoint[0], pathPoint[1], this.PATH_TILE);
                }
            }
        }

        // Post-processing: Remove two-wide paths
        this.fixDoubleWidePaths(intGrid);

        // Analyze and fix dead-ends before returning
        // NOTE: Dead-end tiered analyzer was moved out of this class into `src/deadend-analyzer.ts`.
        // It used to live here as a set of private methods (analyzeAndFixDeadEnds, detectDeadEnds,
        // getPathNeighbors, getDeadEndDirection, tryExtendCorridor, tryBranchFrom, pruneShortDeadEnd,
        // forceConnectDeadEnd). We now build a small context and call the external function.
        const ctx: AnalyzerContext = {
            PATH_TILE: this.PATH_TILE,
            REGION_TILE: this.REGION_TILE,
            levelSize: this.levelSize,
            inBounds: (pos) => this.inBounds(pos),
            getNeighbors: (pos) => this.getNeighbors(pos),
            wouldCreateDoubleWideAt: (pos, grid) => this.wouldCreateDoubleWideAt(pos, grid),
        };
        runDeadEndAnalyzer(
            intGrid,
            ctx,
            (start, end, grid) => this.findPathSegment(start, end, grid),
            (grid) => this.fixDoubleWidePaths(grid)
        );

        return intGrid;
    }

    private generateRegionPoints(): Point[] {
        const points: Point[] = [];
        let attempts = 0;

        while (points.length < this.regionCount && attempts < 1000) {
            attempts++;
            const centerX = Math.floor(Math.random() * this.levelSize[0]);
            const centerY = Math.floor(Math.random() * this.levelSize[1]);
            const newPoint = new Point(centerX, centerY);

            // Check minimum distance constraint
            let tooClose = false;
            for (const existingPoint of points) {
                const distanceSq = (newPoint.x - existingPoint.x) ** 2 + (newPoint.y - existingPoint.y) ** 2;
                if (distanceSq < this.minRegionDistance ** 2) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                points.push(newPoint);
            }
        }

        return points;
    }

    private getDelaunayEdges(delaunay: Delaunator<number[]>, points: Point[]): Edge[] {
        const edges: Edge[] = [];
        const edgeSet = new Set<string>();

        for (let i = 0; i < delaunay.triangles.length; i += 3) {
            // Each triangle has 3 vertices
            for (let j = 0; j < 3; j++) {
                const p1Idx = delaunay.triangles[i + j];
                const p2Idx = delaunay.triangles[i + ((j + 1) % 3)];

                // Create edge (ensure consistent ordering to avoid duplicates)
                const [idx1, idx2] = p1Idx > p2Idx ? [p2Idx, p1Idx] : [p1Idx, p2Idx];
                const edgeKey = `${idx1},${idx2}`;

                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    const edge = new Edge(points[idx1], points[idx2]);
                    edges.push(edge);
                }
            }
        }

        return edges;
    }

    private edgeLength(edge: Edge): number {
        return Math.sqrt((edge.q.x - edge.p.x) ** 2 + (edge.q.y - edge.p.y) ** 2);
    }

    private findPath(start: [number, number], end: [number, number], intGrid: IntGrid): [number, number][] | null {
        // First try to find path with waypoints for more interesting shapes
        const waypoints = this.generateWaypoints(start, end);

        const fullPath: [number, number][] = [];
        let currentStart = start;

        for (const waypoint of [...waypoints, end]) {
            const segment = this.findPathSegment(currentStart, waypoint, intGrid);
            if (segment === null) {
                // Fallback to direct path
                return this.findPathSegment(start, end, intGrid);
            }

            // Remove duplicate points between segments
            if (fullPath.length > 0 && segment.length > 0) {
                if (fullPath[fullPath.length - 1][0] === segment[0][0] && fullPath[fullPath.length - 1][1] === segment[0][1]) {
                    segment.shift();
                }
            }

            fullPath.push(...segment);
            currentStart = waypoint;
        }

        return fullPath.length > 0 ? fullPath : null;
    }

    private generateWaypoints(start: [number, number], end: [number, number]): [number, number][] {
        const waypoints: [number, number][] = [];

        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const distance = Math.abs(dx) + Math.abs(dy);

        // Only add waypoints for longer paths
        if (distance < 8) {
            return waypoints;
        }

        // Decide on path style randomly
        const pathStyles = ['L_shape', 'step', 'zigzag'];
        const pathStyle = pathStyles[Math.floor(Math.random() * pathStyles.length)];

        if (pathStyle === 'L_shape') {
            // Create L-shaped path
            if (Math.random() < 0.5) {
                // Horizontal first, then vertical
                waypoints.push([end[0], start[1]]);
            } else {
                // Vertical first, then horizontal
                waypoints.push([start[0], end[1]]);
            }
        } else if (pathStyle === 'step') {
            // Create step-like pattern
            let midX = start[0] + Math.floor(dx / 2);
            let midY = start[1] + Math.floor(dy / 2);

            // Add some randomness to the midpoint
            const offsetX = Math.floor(Math.random() * 5) - 2;
            const offsetY = Math.floor(Math.random() * 5) - 2;

            midX = Math.max(0, Math.min(this.levelSize[0] - 1, midX + offsetX));
            midY = Math.max(0, Math.min(this.levelSize[1] - 1, midY + offsetY));

            waypoints.push([midX, start[1]]);  // Horizontal first
            waypoints.push([midX, midY]);     // Vertical
            waypoints.push([end[0], midY]);   // Horizontal to end
        } else if (pathStyle === 'zigzag') {
            // Create zigzag pattern for longer paths
            if (distance > 15) {
                const thirdX = start[0] + Math.floor(dx / 3);
                const twoThirdX = start[0] + Math.floor(2 * dx / 3);
                const thirdY = start[1] + Math.floor(dy / 3);
                const twoThirdY = start[1] + Math.floor(2 * dy / 3);

                waypoints.push([thirdX, start[1]]);
                waypoints.push([thirdX, thirdY]);
                waypoints.push([twoThirdX, thirdY]);
                waypoints.push([twoThirdX, twoThirdY]);
            }
        }

        return waypoints;
    }

    private findPathSegment(start: [number, number], end: [number, number], intGrid: IntGrid): [number, number][] | null {
        const openSet: PathNode[] = [];
        const closedSet = new Set<string>();
        const pathNodes = new Map<string, PathNode>();

        // Create start node
        const startNode = new PathNode(start, null, 0, this.getHeuristic(start, end));
        openSet.push(startNode);
        pathNodes.set(startNode.getKey(), startNode);

        while (openSet.length > 0) {
            // Get node with lowest F cost
            openSet.sort((a, b) => a.f - b.f);
            const currentNode = openSet.shift()!;

            // Check if we reached the end
            if (currentNode.position[0] === end[0] && currentNode.position[1] === end[1]) {
                return this.reconstructPath(currentNode);
            }

            closedSet.add(currentNode.getKey());

            // Check neighbors
            for (const neighborPos of this.getNeighbors(currentNode.position)) {
                // Skip if out of bounds
                if (neighborPos[0] < 0 || neighborPos[0] >= this.levelSize[0] ||
                    neighborPos[1] < 0 || neighborPos[1] >= this.levelSize[1]) {
                    continue;
                }

                const neighborKey = `${neighborPos[0]},${neighborPos[1]}`;
                if (closedSet.has(neighborKey)) {
                    continue;
                }

                // Calculate G cost with preference for straight lines
                let tileCost = 1.2;
                if (intGrid.getTile(neighborPos[0], neighborPos[1]) === this.PATH_TILE) {
                    tileCost = 1.0; // Prefer existing paths
                }

                // Add slight cost for direction changes to encourage straighter paths
                if (currentNode.parent) {
                    const directionCost = this.getDirectionChangeCost(
                        currentNode.parent.position,
                        currentNode.position,
                        neighborPos
                    );
                    tileCost += directionCost;
                }

                const newG = currentNode.g + tileCost;

                // Get or create neighbor node
                if (!pathNodes.has(neighborKey)) {
                    const neighborNode = new PathNode(neighborPos, currentNode, newG, this.getHeuristic(neighborPos, end));
                    pathNodes.set(neighborKey, neighborNode);
                    openSet.push(neighborNode);
                } else {
                    const neighborNode = pathNodes.get(neighborKey)!;
                    if (newG < neighborNode.g && !closedSet.has(neighborKey)) {
                        neighborNode.parent = currentNode;
                        neighborNode.g = newG;
                        neighborNode.f = neighborNode.g + neighborNode.h;
                    }
                }
            }
        }

        // No path found
        return null;
    }

    private getDirectionChangeCost(prevPos: [number, number], currPos: [number, number], nextPos: [number, number]): number {
        const prevDir = [currPos[0] - prevPos[0], currPos[1] - prevPos[1]];
        const nextDir = [nextPos[0] - currPos[0], nextPos[1] - currPos[1]];

        // If directions are the same, no extra cost
        if (prevDir[0] === nextDir[0] && prevDir[1] === nextDir[1]) {
            return 0.0;
        }

        // Small penalty for direction change
        return 0.1;
    }

    private fixDoubleWidePaths(intGrid: IntGrid): void {
        let changesMade = true;
        let iterations = 0;
        const maxIterations = 10; // Prevent infinite loops

        while (changesMade && iterations < maxIterations) {
            changesMade = false;
            iterations++;

            // Find all 2x2 path blocks
            const doubleWideBlocks = this.findDoubleWideBlocks(intGrid);

            for (const block of doubleWideBlocks) {
                // Try to fix this block
                if (this.fixSingleDoubleWideBlock(block, intGrid)) {
                    changesMade = true;
                }
            }
        }
    }

    private findDoubleWideBlocks(intGrid: IntGrid): [number, number][][] {
        const blocks: [number, number][][] = [];

        for (let x = 0; x < this.levelSize[0] - 1; x++) {
            for (let y = 0; y < this.levelSize[1] - 1; y++) {
                // Check if we have a 2x2 block of paths
                const blockPositions: [number, number][] = [
                    [x, y], [x + 1, y],
                    [x, y + 1], [x + 1, y + 1]
                ];

                if (blockPositions.every(pos => intGrid.getTile(pos[0], pos[1]) === this.PATH_TILE)) {
                    blocks.push(blockPositions);
                }
            }
        }

        return blocks;
    }

    private fixSingleDoubleWideBlock(block: [number, number][], intGrid: IntGrid): boolean {
        // Count connections for each position in the block
        const connectionCounts: Array<{ pos: [number, number], connections: number }> = [];

        for (const pos of block) {
            const connections = this.countPathConnections(pos, intGrid, new Set(block.map(p => `${p[0]},${p[1]}`)));
            connectionCounts.push({ pos, connections });
        }

        // Sort by connection count (remove tile with fewest external connections)
        connectionCounts.sort((a, b) => a.connections - b.connections);

        // Find the best tile to remove
        for (const { pos, connections } of connectionCounts) {
            // Don't remove if it would disconnect the network
            if (this.wouldDisconnectNetwork(pos, intGrid, block)) {
                continue;
            }

            // Remove this tile
            intGrid.setTile(pos[0], pos[1], this.REGION_TILE);
            return true;
        }

        // If we can't safely remove any tile, remove the one with least connections anyway
        if (connectionCounts.length > 0) {
            const posToRemove = connectionCounts[0].pos;
            intGrid.setTile(posToRemove[0], posToRemove[1], this.REGION_TILE);
            return true;
        }

        return false;
    }

    private countPathConnections(pos: [number, number], intGrid: IntGrid, excludePositions: Set<string> = new Set()): number {
        let count = 0;
        for (const neighbor of this.getNeighbors(pos)) {
            const neighborKey = `${neighbor[0]},${neighbor[1]}`;
            if (!excludePositions.has(neighborKey)) {
                if (neighbor[0] >= 0 && neighbor[0] < this.levelSize[0] &&
                    neighbor[1] >= 0 && neighbor[1] < this.levelSize[1] &&
                    intGrid.getTile(neighbor[0], neighbor[1]) === this.PATH_TILE) {
                    count++;
                }
            }
        }
        return count;
    }

    private wouldDisconnectNetwork(pos: [number, number], intGrid: IntGrid, block: [number, number][]): boolean {
        // Simplified check - in a full implementation, you might want to do
        // a more thorough connectivity analysis
        const blockSet = new Set(block.map(p => `${p[0]},${p[1]}`));
        const externalConnections = this.countPathConnections(pos, intGrid, blockSet);

        // If it has 3+ external connections, it's likely important for connectivity
        if (externalConnections >= 3) {
            return true;
        }

        // For 2 connections, check if they're in opposite directions (straight path)
        if (externalConnections === 2) {
            const neighbors: [number, number][] = [];
            for (const neighbor of this.getNeighbors(pos)) {
                const neighborKey = `${neighbor[0]},${neighbor[1]}`;
                if (!blockSet.has(neighborKey)) {
                    if (neighbor[0] >= 0 && neighbor[0] < this.levelSize[0] &&
                        neighbor[1] >= 0 && neighbor[1] < this.levelSize[1] &&
                        intGrid.getTile(neighbor[0], neighbor[1]) === this.PATH_TILE) {
                        neighbors.push(neighbor);
                    }
                }
            }

            if (neighbors.length === 2) {
                // Check if neighbors are opposite each other (straight line)
                const dx1 = neighbors[0][0] - pos[0];
                const dy1 = neighbors[0][1] - pos[1];
                const dx2 = neighbors[1][0] - pos[0];
                const dy2 = neighbors[1][1] - pos[1];

                // If they're opposite directions, this might be important for connectivity
                if (dx1 === -dx2 && dy1 === -dy2) {
                    return true;
                }
            }
        }

        return false;
    }

    private reconstructPath(endNode: PathNode): [number, number][] {
        const path: [number, number][] = [];
        let currentNode: PathNode | null = endNode;

        while (currentNode !== null) {
            path.unshift(currentNode.position);
            currentNode = currentNode.parent;
        }

        return path;
    }

    private getHeuristic(a: [number, number], b: [number, number]): number {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    }

    private getNeighbors(pos: [number, number]): [number, number][] {
        const [x, y] = pos;
        return [
            [x, y + 1],  // Up
            [x + 1, y],  // Right
            [x, y - 1],  // Down
            [x - 1, y]   // Left
        ];
    }

    // =========================
    // Dead-end analysis pipeline (moved)
    // =========================
    // NOTE: The dead-end tiered analysis/repair that used to be implemented below has been
    // extracted to `src/deadend-analyzer.ts` to keep this class focused on core generation.
    // The following helpers remain because they're used by the external analyzer via context.

    private inBounds(pos: [number, number]): boolean {
        return (
            pos[0] >= 0 && pos[0] < this.levelSize[0] &&
            pos[1] >= 0 && pos[1] < this.levelSize[1]
        );
    }

    private wouldCreateDoubleWideAt(pos: [number, number], intGrid: IntGrid): boolean {
        const [x, y] = pos;
        // Check four possible 2x2 squares around (x,y)
        for (let ox = -1; ox <= 0; ox++) {
            for (let oy = -1; oy <= 0; oy++) {
                const cells: [number, number][] = [
                    [x + ox, y + oy],
                    [x + ox + 1, y + oy],
                    [x + ox, y + oy + 1],
                    [x + ox + 1, y + oy + 1],
                ];
                let count = 0;
                for (const c of cells) {
                    if (!this.inBounds(c)) { count = -100; break; }
                    if (c[0] === x && c[1] === y) {
                        count++;
                    } else if (intGrid.getTile(c[0], c[1]) === this.PATH_TILE) {
                        count++;
                    }
                }
                if (count === 4) return true;
            }
        }
        return false;
    }
}