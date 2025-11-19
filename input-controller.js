export class InputController {
    constructor(game, onInteraction) {
        this.game = game;
        this.onInteraction = onInteraction;
        
        // Bind handlers
        this.boundTap = this.handleTap.bind(this);
        this.boundKey = this.handleKey.bind(this);
        this.boundResize = this.handleResize.bind(this);
    }

    init() {
        window.addEventListener('pointerdown', this.boundTap);
        window.addEventListener('keydown', this.boundKey);
        window.addEventListener('resize', this.boundResize);
    }

    cleanup() {
        window.removeEventListener('pointerdown', this.boundTap);
        window.removeEventListener('keydown', this.boundKey);
        window.removeEventListener('resize', this.boundResize);
    }

    handleTap(e) {
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            this.onInteraction(); 
            this.game.handleTap();
        }
    }

    handleKey(e) {
        if (e.code === 'Space') {
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

            e.preventDefault();
            this.onInteraction();
            this.game.handleTap();
        }
    }

    handleResize() {
        this.game.resizeCanvas();
    }
}