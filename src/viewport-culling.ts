/**
 * ViewportCulling
 * ---------------
 * Handles viewport-based culling for efficient rendering.
 * Supports chunk-based culling where only the current chunk and adjacent chunks are rendered.
 * 
 * Chunk Definition:
 * A chunk is defined as the initial level we generate (and subsequently other levels 
 * we will connect to it in the future). Currently, we only have one chunk which is 
 * the entire generated grid.
 */

import { IntGrid } from './data-structures';

export interface CullingBounds {
    startX: number;
    endX: number;
    startY: number;
    endY: number;
}

export interface ChunkInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

export class ViewportCulling {
    private static readonly CULL_BUFFER_CELLS = 2; // Extra tiles beyond viewport each side
    
    private enabled: boolean = true;
    private chunkBasedCulling: boolean = false;
    
    // Chunk system properties
    private chunkSize: { width: number; height: number } = { width: 50, height: 50 };
    private currentChunk: { x: number; y: number } = { x: 0, y: 0 };
    
    constructor() {}
    
    /**
     * Enable or disable viewport culling
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }
    
    /**
     * Get current enabled state
     */
    isEnabled(): boolean {
        return this.enabled;
    }
    
    /**
     * Enable or disable chunk-based culling
     */
    setChunkBasedCulling(enabled: boolean): void {
        this.chunkBasedCulling = enabled;
    }
    
    /**
     * Get current chunk-based culling state
     */
    isChunkBasedCulling(): boolean {
        return this.chunkBasedCulling;
    }
    
    /**
     * Set the chunk size (for future multi-chunk support)
     */
    setChunkSize(width: number, height: number): void {
        this.chunkSize = { width, height };
    }
    
    /**
     * Set the current chunk coordinates (for future multi-chunk support)
     */
    setCurrentChunk(chunkX: number, chunkY: number): void {
        this.currentChunk = { x: chunkX, y: chunkY };
    }
    
    /**
     * Calculate culling bounds based on camera viewport or chunk-based visibility
     */
    calculateCullingBounds(
        grid: IntGrid,
        camera: Phaser.Cameras.Scene2D.Camera,
        cellSize: number,
        offsetX: number,
        offsetY: number,
        scaleWidth: number,
        scaleHeight: number
    ): CullingBounds {
        if (!this.enabled) {
            // Return full grid bounds if culling is disabled
            return {
                startX: 0,
                endX: grid.width - 1,
                startY: 0,
                endY: grid.height - 1
            };
        }
        
        if (this.chunkBasedCulling) {
            return this.calculateChunkBasedBounds(grid);
        } else {
            return this.calculateViewportBasedBounds(
                grid, camera, cellSize, offsetX, offsetY, scaleWidth, scaleHeight
            );
        }
    }
    
    /**
     * Calculate bounds based on current chunk and adjacent chunks
     */
    private calculateChunkBasedBounds(grid: IntGrid): CullingBounds {
        // For now, since we only have one chunk (the entire grid),
        // we show the entire current chunk
        // In the future, this will be expanded to show current chunk + adjacent chunks
        
        const chunkStartX = this.currentChunk.x * this.chunkSize.width;
        const chunkStartY = this.currentChunk.y * this.chunkSize.height;
        
        let startX = Math.max(0, chunkStartX);
        let endX = Math.min(grid.width - 1, chunkStartX + this.chunkSize.width - 1);
        let startY = Math.max(0, chunkStartY);
        let endY = Math.min(grid.height - 1, chunkStartY + this.chunkSize.height - 1);
        
        // Future enhancement: Add adjacent chunks
        // For now, since we have only one chunk that covers the entire grid,
        // we include adjacent chunk areas (which don't exist yet)
        
        return { startX, endX, startY, endY };
    }
    
    /**
     * Calculate bounds based on camera viewport
     */
    private calculateViewportBasedBounds(
        grid: IntGrid,
        camera: Phaser.Cameras.Scene2D.Camera,
        cellSize: number,
        offsetX: number,
        offsetY: number,
        scaleWidth: number,
        scaleHeight: number
    ): CullingBounds {
        const zoom = camera.zoom;
        
        // Convert camera bounds to grid coordinates
        const viewLeft = (camera.scrollX - offsetX) / cellSize;
        const viewRight = ((camera.scrollX + scaleWidth / zoom) - offsetX) / cellSize;
        const viewTop = (camera.scrollY - offsetY) / cellSize;
        const viewBottom = ((camera.scrollY + scaleHeight / zoom) - offsetY) / cellSize;
        
        // Add buffer around visible area (in grid cells)
        const buffer = ViewportCulling.CULL_BUFFER_CELLS;
        const startX = Math.max(0, Math.floor(viewLeft) - buffer);
        const endX = Math.min(grid.width - 1, Math.ceil(viewRight) + buffer);
        const startY = Math.max(0, Math.floor(viewTop) - buffer);
        const endY = Math.min(grid.height - 1, Math.ceil(viewBottom) + buffer);
        
        return { startX, endX, startY, endY };
    }
    
    /**
     * Get information about the current chunk
     */
    getCurrentChunkInfo(): ChunkInfo {
        const chunkX = this.currentChunk.x;
        const chunkY = this.currentChunk.y;
        const width = this.chunkSize.width;
        const height = this.chunkSize.height;
        
        return {
            x: chunkX,
            y: chunkY,
            width: width,
            height: height,
            offsetX: chunkX * width,
            offsetY: chunkY * height
        };
    }
    
    /**
     * Check if a tile coordinate is within the currently visible chunks
     */
    isTileInVisibleChunks(tileX: number, tileY: number): boolean {
        if (!this.chunkBasedCulling) {
            return true; // All tiles are visible when not using chunk-based culling
        }
        
        // Calculate which chunk this tile belongs to
        const tileChunkX = Math.floor(tileX / this.chunkSize.width);
        const tileChunkY = Math.floor(tileY / this.chunkSize.height);
        
        // Check if tile is in current chunk or adjacent chunks
        const currentX = this.currentChunk.x;
        const currentY = this.currentChunk.y;
        
        // For now, only show current chunk since we have only one
        // In future: allow adjacent chunks (currentX ± 1, currentY ± 1)
        return tileChunkX === currentX && tileChunkY === currentY;
    }
}