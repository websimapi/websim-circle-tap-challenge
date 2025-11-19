import { showReplay, hideReplay } from './replay.js';
import { fadeInMusic, fadeOutMusic } from './audio.js';

export class ReplayManager {
    constructor(game, ui, elements, onInteraction) {
        this.game = game;
        this.ui = ui;
        this.elements = elements;
        this.onInteraction = onInteraction;
        this.replayOrigin = 'gameover';
        
        // Bind methods
        this.boundRequestReplay = this.handleRequestReplay.bind(this);
    }

    init() {
        // Replay from Game Over screen
        this.elements.replayBtn.addEventListener('click', async () => {
            this.onInteraction();
            this.replayOrigin = 'gameover';
            await this.playReplay(this.game.replayFrames, this.game.replayConfig);
        });

        // Close Replay
        this.elements.closeReplayBtn.addEventListener('click', () => {
            this.ui.hideReplayContainer(this.replayOrigin);
            hideReplay(); 
            fadeInMusic();
        });

        // Replay from Leaderboard (via event)
        window.addEventListener('requestReplay', this.boundRequestReplay);
    }

    handleRequestReplay(e) {
        const { data, origin } = e.detail;
        this.replayOrigin = origin;
        showReplay(data); 
    }

    async playReplay(frames, config) {
        fadeOutMusic();
        this.ui.showReplayContainer();
        
        if (!config.currentUser) {
            try {
                config.currentUser = await window.websim.getCurrentUser();
            } catch (error) {
                console.error("User fetch error", error);
            }
        }

        showReplay({ frames, config });
    }
}