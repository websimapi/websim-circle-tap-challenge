import { Game } from './game.js';
import { UIController, getUIElements } from './ui.js';
import { submitScore, migrateUserScores } from './leaderboard.js';
import { playBackgroundMusic } from './audio.js';
import { ChallengeManager } from './challenge-manager.js';
import { LeaderboardUIManager } from './leaderboard-ui.js';
import { InputController } from './input-controller.js';
import { ReplayManager } from './replay-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    let hasInteracted = false;

    const handleFirstInteraction = () => {
        if (!hasInteracted) {
            hasInteracted = true;
            playBackgroundMusic();
        }
    };
    
    // Get UI Elements
    const elements = getUIElements();

    // Core Systems
    const game = new Game(canvas);
    const ui = new UIController(elements);
    const challengeManager = new ChallengeManager(game, ui, elements);
    const leaderboardUI = new LeaderboardUIManager(ui, elements);
    
    // New Managers
    const inputController = new InputController(game, handleFirstInteraction);
    inputController.init();
    
    const replayManager = new ReplayManager(game, ui, elements, handleFirstInteraction);
    replayManager.init();

    // --- Game Wiring ---
    game.onScoreUpdate = (score) => {
        ui.updateScore(score);
        challengeManager.sendUpdate();
    };
    
    game.onLevelUp = (level, isInitial) => {
        ui.updateLevel(level, isInitial);
        challengeManager.sendUpdate();
    };

    game.onLivesUpdate = (lives) => {
        ui.updateLives(lives);
        challengeManager.sendUpdate();
    };

    game.onGameOver = (gameData) => {
        if (game.mode === 'challenge') {
            challengeManager.sendGameOver();
            ui.showGameOverMenu(gameData.score); 
        } else {
            ui.showGameOverMenu(gameData.score);
        }
    };

    // --- Global Event Handling ---

    // Difficulty Selection (Solo)
    elements.difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            handleFirstInteraction();
            game.start(btn.dataset.difficulty, 'solo');
            ui.showGameScreen('solo');
        });
    });

    // Restart
    elements.restartBtn.addEventListener('click', () => {
        ui.clearTimeouts();
        
        if (game.mode === 'challenge') {
            challengeManager.requestRetry();
        } else {
            game.reset();
            ui.showGameScreen(game.mode);
            // Default retry to solo logic
            game.start(game.currentDifficulty, 'solo'); 
        }
    });

    // Home
    elements.homeBtn.addEventListener('click', () => {
        ui.clearTimeouts();
        game.reset();
        
        if (game.mode === 'challenge') {
            challengeManager.disconnect();
        }
        
        ui.showStartMenu();
    });

    // Leaderboard
    elements.leaderboardBtn.addEventListener('click', () => {
        handleFirstInteraction();
        leaderboardUI.open();
    });

    // Submit Score
    elements.submitScoreBtn.addEventListener('click', async () => {
        ui.setSubmitButtonState('disabled', 'Submitting...');
        
        await submitScore(
            game.lastGameData,
            () => ui.setSubmitButtonState('disabled', 'Submitted!'),
            () => {
                ui.setSubmitButtonState('disabled', 'Error!');
                setTimeout(() => ui.setSubmitButtonState('enabled', 'To Submit'), 2000);
            }
        );
    });

    // --- Input Handling ---

    // Auto-join logic
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('id') || urlParams.get('join');
    if (joinId) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);color:white;display:flex;justify-content:center;align-items:center;z-index:1000;';
        overlay.innerHTML = '<button style="padding:20px;font-size:20px;">Tap to Join Match</button>';
        document.body.appendChild(overlay);
        
        overlay.querySelector('button').onclick = () => {
            handleFirstInteraction();
            overlay.remove();
            challengeManager.connectToHost(joinId);
        };
    }

    // Init
    game.reset();
    migrateUserScores();
});