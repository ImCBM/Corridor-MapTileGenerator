import * as Phaser from 'phaser';
import { HeIsComingGenerator } from './level-generator';
import { IntGrid } from './data-structures';

export class GameScene extends Phaser.Scene {
    private generator: HeIsComingGenerator;
    private currentGrid: IntGrid | null = null;
    private graphics!: Phaser.GameObjects.Graphics;
    private cellSize: number = 12;
    private lastDrawTime: number = 0;
    private drawThrottleMs: number = 16; // ~60 FPS
    private useViewportCulling: boolean = true;

    constructor() {
        super({ key: 'GameScene' });
        this.generator = new HeIsComingGenerator();
    }

    create(): void {
        // Create graphics object for drawing the grid
        this.graphics = this.add.graphics();

        // Set up camera controls
        this.cameras.main.setZoom(1);
        
        // Add mouse wheel zoom
        this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) => {
            const zoom = this.cameras.main.zoom;
            const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.1, 3);
            this.cameras.main.setZoom(newZoom);
            // Redraw grid after zoom change
            this.drawGrid();
        });

        // Add click and drag to pan
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                this.input.on('pointermove', this.handleCameraDrag, this);
            }
        });

        this.input.on('pointerup', () => {
            this.input.off('pointermove', this.handleCameraDrag, this);
            // Redraw grid after pan ends to ensure clean rendering
            this.drawGrid();
        });

        // Generate initial level
        this.generateLevel();
    }

    private handleCameraDrag(pointer: Phaser.Input.Pointer): void {
        if (pointer.isDown) {
            const deltaX = pointer.x - pointer.prevPosition.x;
            const deltaY = pointer.y - pointer.prevPosition.y;
            
            this.cameras.main.scrollX -= deltaX / this.cameras.main.zoom;
            this.cameras.main.scrollY -= deltaY / this.cameras.main.zoom;
            
            // Throttled redraw during drag for better performance
            const now = Date.now();
            if (now - this.lastDrawTime > this.drawThrottleMs) {
                this.drawGrid();
                this.lastDrawTime = now;
            }
        }
    }

    generateLevel(width: number = 30, height: number = 20, regions: number = 8, minDistance: number = 3): void {
        try {
            // Update generator settings
            this.generator.levelSize = [width, height];
            this.generator.regionCount = regions;
            this.generator.minRegionDistance = minDistance;

            // Generate the grid
            this.currentGrid = this.generator.generateLayout();

            // Draw the grid
            this.drawGrid();

            // Update info display
            this.updateInfoDisplay();

        } catch (error) {
            console.error('Error generating level:', error);
            this.showError('Failed to generate level. Please try different settings.');
        }
    }

    private drawGrid(): void {
        if (!this.currentGrid) return;

        this.graphics.clear();

        const width = this.currentGrid.width;
        const height = this.currentGrid.height;

        // Center the grid in the view
        const offsetX = (this.scale.width - width * this.cellSize) / 2;
        const offsetY = (this.scale.height - height * this.cellSize) / 2;

        // Viewport culling bounds - only if enabled
        let startX = 0, endX = width - 1, startY = 0, endY = height - 1;
        
        if (this.useViewportCulling) {
            const camera = this.cameras.main;
            const zoom = camera.zoom;
            
            // Convert camera bounds to grid coordinates
            const viewLeft = (camera.scrollX - offsetX) / this.cellSize;
            const viewRight = ((camera.scrollX + this.scale.width / zoom) - offsetX) / this.cellSize;
            const viewTop = (camera.scrollY - offsetY) / this.cellSize;
            const viewBottom = ((camera.scrollY + this.scale.height / zoom) - offsetY) / this.cellSize;

            // Add buffer around visible area (in grid cells)
            const buffer = 2;
            startX = Math.max(0, Math.floor(viewLeft) - buffer);
            endX = Math.min(width - 1, Math.ceil(viewRight) + buffer);
            startY = Math.max(0, Math.floor(viewTop) - buffer);
            endY = Math.min(height - 1, Math.ceil(viewBottom) + buffer);
        }

        // Only draw visible tiles
        let tilesRendered = 0;
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                // Convert grid Y to screen Y (flip Y for proper display)
                const screenY = (height - 1 - y) * this.cellSize + offsetY;
                const screenX = x * this.cellSize + offsetX;

                const tileType = this.currentGrid.getTile(x, y);

                // Choose color based on tile type
                let color: number;
                if (tileType === this.generator.PATH_TILE) {
                    color = 0x90EE90; // Light green for paths
                } else if (tileType === this.generator.REGION_TILE) {
                    color = 0x8B4513; // Brown for regions
                } else if (tileType === this.generator.REGION_CENTER_TILE) {
                    color = 0xFF0000; // Red for region centers
                } else {
                    color = 0xF0F0F0; // Light gray for empty
                }

                // Draw filled rectangle
                this.graphics.fillStyle(color);
                this.graphics.fillRect(screenX, screenY, this.cellSize, this.cellSize);

                // Draw border
                this.graphics.lineStyle(1, 0xCCCCCC, 0.3);
                this.graphics.strokeRect(screenX, screenY, this.cellSize, this.cellSize);
                
                tilesRendered++;
            }
        }

        // Update performance info
        this.updatePerformanceInfo(tilesRendered, width * height);

        // Update camera bounds to fit the grid
        const gridWidth = width * this.cellSize;
        const gridHeight = height * this.cellSize;
        this.cameras.main.setBounds(offsetX - 100, offsetY - 100, gridWidth + 200, gridHeight + 200);
    }

    private updateInfoDisplay(): void {
        const infoElement = document.getElementById('info-text');
        if (infoElement && this.generator.edges) {
            infoElement.textContent = `Generated ${this.generator.edges.length} connections between regions`;
        }
    }

    private updatePerformanceInfo(tilesRendered: number, totalTiles: number): void {
        const infoElement = document.getElementById('info-text');
        if (infoElement && this.generator.edges) {
            const percentage = ((tilesRendered / totalTiles) * 100).toFixed(1);
            infoElement.textContent = `Generated ${this.generator.edges.length} connections | Rendering ${tilesRendered}/${totalTiles} tiles (${percentage}%)`;
        }
    }

    private showError(message: string): void {
        const infoElement = document.getElementById('info-text');
        if (infoElement) {
            infoElement.textContent = message;
            infoElement.style.color = '#e74c3c';
            
            // Reset color after 3 seconds
            setTimeout(() => {
                if (infoElement) {
                    infoElement.style.color = '#bdc3c7';
                }
            }, 3000);
        }
    }

    // Method to be called from UI
    public onGenerateButtonClick(): void {
        const widthInput = document.getElementById('width') as HTMLInputElement;
        const heightInput = document.getElementById('height') as HTMLInputElement;
        const regionsInput = document.getElementById('regions') as HTMLInputElement;
        const distanceInput = document.getElementById('distance') as HTMLInputElement;
        const cullingInput = document.getElementById('culling') as HTMLInputElement;

        const width = parseInt(widthInput.value) || 30;
        const height = parseInt(heightInput.value) || 20;
        const regions = parseInt(regionsInput.value) || 8;
        const distance = parseInt(distanceInput.value) || 3;
        this.useViewportCulling = cullingInput.checked;

        this.generateLevel(width, height, regions, distance);
    }

    // Method to toggle viewport culling from UI
    public onCullingToggle(): void {
        const cullingInput = document.getElementById('culling') as HTMLInputElement;
        this.useViewportCulling = cullingInput.checked;
        this.drawGrid(); // Redraw immediately to show effect
    }
}