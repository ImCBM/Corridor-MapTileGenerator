import { IntGrid } from '../data-structures';

/**
 * Player
 * ------
 * Represents the player character (red triangle) that can move on path tiles.
 * Handles WASD/Arrow key input and validates movement against the grid.
 */
export class Player {
    public x: number;
    public y: number;
    private grid: IntGrid | null = null;
    private pathTileType: number;
    private keys: { [key: string]: boolean } = {};
    private lastMoveTime: number = 0;
    private readonly MOVE_COOLDOWN = 150; // milliseconds between moves

    constructor(startX: number, startY: number, pathTileType: number) {
        this.x = startX;
        this.y = startY;
        this.pathTileType = pathTileType;
        this.setupKeyListeners();
    }

    /**
     * Set the grid reference for movement validation
     */
    setGrid(grid: IntGrid): void {
        this.grid = grid;
    }

    /**
     * Set up keyboard event listeners for WASD and arrow keys
     */
    private setupKeyListeners(): void {
        document.addEventListener('keydown', (event) => {
            const key = event.code.toLowerCase();
            if (this.isMovementKey(key)) {
                this.keys[key] = true;
                event.preventDefault();
            }
        });

        document.addEventListener('keyup', (event) => {
            const key = event.code.toLowerCase();
            if (this.isMovementKey(key)) {
                this.keys[key] = false;
                event.preventDefault();
            }
        });
    }

    /**
     * Check if a key is a movement key
     */
    private isMovementKey(key: string): boolean {
        return ['keyw', 'keya', 'keys', 'keyd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key);
    }

    /**
     * Update player position based on input (call this each frame)
     */
    update(): boolean {
        if (!this.grid) return false;

        const now = Date.now();
        if (now - this.lastMoveTime < this.MOVE_COOLDOWN) {
            return false;
        }

        let newX = this.x;
        let newY = this.y;
        let moved = false;

        // Check for movement input (WASD or Arrow keys)
        if (this.keys['keyw'] || this.keys['arrowup']) {
            newY = this.y + 1;
            moved = true;
        } else if (this.keys['keys'] || this.keys['arrowdown']) {
            newY = this.y - 1;
            moved = true;
        } else if (this.keys['keya'] || this.keys['arrowleft']) {
            newX = this.x - 1;
            moved = true;
        } else if (this.keys['keyd'] || this.keys['arrowright']) {
            newX = this.x + 1;
            moved = true;
        }

        if (moved && this.canMoveTo(newX, newY)) {
            this.x = newX;
            this.y = newY;
            this.lastMoveTime = now;
            return true;
        }

        return false;
    }

    /**
     * Check if the player can move to the specified position
     */
    private canMoveTo(x: number, y: number): boolean {
        if (!this.grid) return false;

        // Check bounds
        if (x < 0 || x >= this.grid.width || y < 0 || y >= this.grid.height) {
            return false;
        }

        // Check if the tile is a path tile (including outer paths)
        const tileType = this.grid.getTile(x, y);
        return tileType === this.pathTileType;
    }

    /**
     * Set player position (useful for spawning or teleporting)
     */
    setPosition(x: number, y: number): void {
        if (this.canMoveTo(x, y)) {
            this.x = x;
            this.y = y;
        }
    }

    /**
     * Find a valid spawn position on a path tile
     */
    findValidSpawnPosition(): boolean {
        if (!this.grid) return false;

        // Try to find a path tile to spawn on
        for (let y = 0; y < this.grid.height; y++) {
            for (let x = 0; x < this.grid.width; x++) {
                if (this.grid.getTile(x, y) === this.pathTileType) {
                    this.x = x;
                    this.y = y;
                    return true;
                }
            }
        }
        return false;
    }
}