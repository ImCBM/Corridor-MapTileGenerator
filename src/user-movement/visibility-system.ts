/**
 * VisibilitySystem
 * ----------------
 * Handles the red tinting effect around the player based on distance.
 * Creates a visibility radius where tiles become more tinted the further they are.
 */
export class VisibilitySystem {
    private readonly CLEAR_RADIUS = 5;      // Tiles within this radius are clear
    private readonly MAX_TINT_RADIUS = 8;   // Maximum radius for tinting effect
    private readonly TINT_DIAMETER = 8;     // 8 tile diameter as requested

    /**
     * Calculate the tint intensity for a tile based on its distance from the player
     * @param playerX - Player's X position
     * @param playerY - Player's Y position
     * @param tileX - Tile's X position
     * @param tileY - Tile's Y position
     * @returns Tint intensity from 0 (no tint) to 1 (maximum tint)
     */
    getTintIntensity(playerX: number, playerY: number, tileX: number, tileY: number): number {
        // Calculate distance using Chebyshev distance (max of dx, dy) for square effect
        const dx = Math.abs(tileX - playerX);
        const dy = Math.abs(tileY - playerY);
        const distance = Math.max(dx, dy);

        // No tint within clear radius
        if (distance <= this.CLEAR_RADIUS) {
            return 0;
        }

        // Full tint beyond max radius
        if (distance > this.MAX_TINT_RADIUS) {
            return 1;
        }

        // Gradual tint between clear radius and max radius
        const tintRange = this.MAX_TINT_RADIUS - this.CLEAR_RADIUS;
        const distanceInTintRange = distance - this.CLEAR_RADIUS;
        return distanceInTintRange / tintRange;
    }

    /**
     * Apply red tint to a color based on intensity
     * @param originalColor - The original color (hex)
     * @param tintIntensity - Tint intensity from 0 to 1
     * @returns Tinted color (hex)
     */
    applyRedTint(originalColor: number, tintIntensity: number): number {
        if (tintIntensity <= 0) {
            return originalColor;
        }

        // Extract RGB components
        const r = (originalColor >> 16) & 0xFF;
        const g = (originalColor >> 8) & 0xFF;
        const b = originalColor & 0xFF;

        // Apply red tint by reducing green and blue components
        const tintedR = Math.min(255, r + (255 - r) * tintIntensity * 0.3);
        const tintedG = Math.max(0, g - g * tintIntensity * 0.6);
        const tintedB = Math.max(0, b - b * tintIntensity * 0.6);

        // Combine back to hex
        return (Math.floor(tintedR) << 16) | (Math.floor(tintedG) << 8) | Math.floor(tintedB);
    }

    /**
     * Check if a tile should be affected by the visibility system
     * @param playerX - Player's X position
     * @param playerY - Player's Y position
     * @param tileX - Tile's X position
     * @param tileY - Tile's Y position
     * @returns True if the tile is within the visibility radius
     */
    isWithinVisibilityRadius(playerX: number, playerY: number, tileX: number, tileY: number): boolean {
        const dx = Math.abs(tileX - playerX);
        const dy = Math.abs(tileY - playerY);
        const distance = Math.max(dx, dy);
        return distance <= this.MAX_TINT_RADIUS;
    }
}