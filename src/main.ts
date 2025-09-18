import * as Phaser from 'phaser';
import { GameScene } from './game-scene';

// Phaser game configuration
const config: Phaser.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#2c3e50',
    scene: [GameScene]
};

// Create the game
const game = new Phaser.Game(config);

// Get reference to the game scene
let gameScene: GameScene;

// Simple timeout to wait for scene creation
setTimeout(() => {
    gameScene = game.scene.getScene('GameScene') as unknown as GameScene;
    setupUI();
}, 100);

function setupUI(): void {
    const generateButton = document.getElementById('generate-btn');
    if (generateButton) {
        generateButton.addEventListener('click', () => {
            if (!gameScene) return;
            
            // Disable button during generation
            generateButton.setAttribute('disabled', 'true');
            generateButton.textContent = 'Generating...';
            
            // Reset info text
            const infoElement = document.getElementById('info-text');
            if (infoElement) {
                infoElement.style.color = '#bdc3c7';
            }
            
            // Generate level with a small delay to allow UI to update
            setTimeout(() => {
                try {
                    gameScene.onGenerateButtonClick();
                } catch (error) {
                    console.error('Generation error:', error);
                    if (infoElement) {
                        infoElement.textContent = 'Generation failed. Please try different settings.';
                        infoElement.style.color = '#e74c3c';
                    }
                } finally {
                    // Re-enable button
                    generateButton.removeAttribute('disabled');
                    generateButton.textContent = 'Generate Level';
                }
            }, 10);
        });
    }

    // Setup culling toggle
    const cullingCheckbox = document.getElementById('culling');
    if (cullingCheckbox) {
        cullingCheckbox.addEventListener('change', () => {
            if (gameScene) {
                gameScene.onCullingToggle();
            }
        });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        if (game.scale && game.scale.resize) {
            game.scale.resize(window.innerWidth, window.innerHeight);
        }
    });
}

// Export game for debugging
(window as any).game = game;