export class UIController {
    constructor(elements) {
        this.elements = elements;
        this.levelFadeTimeout = null;
        this.gameOverButtonTimeout = null;
        // Bind methods
        this.updateLives = this.updateLives.bind(this);
        
        this.invites = []; // Store invites here
    }

    updatePlayerList(peers) {
        const list = this.elements.playersList;
        // Filter out self? room.clientId
        // We can't access room here easily unless we import, but let's assume passed data is filtered or we handle it.
        // Actually, pass currentClientId to this method or filtered list.
        
        list.innerHTML = '';
        
        if (!peers || peers.length === 0) {
            list.innerHTML = '<div class="empty-state">No other players online</div>';
            return;
        }

        peers.forEach(peer => {
            const div = document.createElement('div');
            div.className = 'player-item';
            div.innerHTML = `
                <img class="player-avatar" src="${peer.avatarUrl || 'https://via.placeholder.com/32'}" alt="${peer.username}">
                <div class="player-info">
                    <div class="player-name">${peer.username}</div>
                </div>
                <button class="challenge-action-btn challenge-player-btn" data-id="${peer.id}">Challenge</button>
            `;
            list.appendChild(div);
        });
    }

    addInvite(invite) {
        // Check if already exists
        if (this.invites.some(i => i.senderId === invite.senderId)) return;
        
        this.invites.push(invite);
        this.updateInviteBadge();
        this.renderInvites();
    }

    removeInvite(senderId) {
        this.invites = this.invites.filter(i => i.senderId !== senderId);
        this.updateInviteBadge();
        this.renderInvites();
    }

    updateInviteBadge() {
        const badge = this.elements.inviteBadge;
        const count = this.invites.length;
        badge.textContent = count;
        if (count > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    renderInvites() {
        const list = this.elements.invitesList;
        list.innerHTML = '';

        if (this.invites.length === 0) {
            list.innerHTML = '<div class="empty-state">No pending invites</div>';
            return;
        }

        this.invites.forEach(invite => {
            const div = document.createElement('div');
            div.className = 'invite-item';
            div.innerHTML = `
                <img class="player-avatar" src="${invite.avatarUrl || 'https://via.placeholder.com/32'}" alt="${invite.username}">
                <div class="player-info">
                    <div class="player-name">${invite.username}</div>
                    <div style="font-size: 0.7rem; color: #aaa;">wants to play</div>
                </div>
                <button class="challenge-action-btn accept-btn" data-id="${invite.senderId}" data-peer="${invite.peerId}">Accept</button>
                <button class="challenge-action-btn reject-btn" data-id="${invite.senderId}">&times;</button>
            `;
            list.appendChild(div);
        });
    }
    
    switchChallengeTab(tabName) {
        this.elements.challengeTabs.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        this.elements.challengeTabViews.forEach(view => {
            if (view.id === `${tabName}-view`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });
    }

    showStartMenu() {
        this.elements.startMenu.classList.remove('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
        this.elements.scoreDisplay.classList.add('hidden');
        this.elements.levelDisplay.classList.add('hidden');
        this.elements.challengeMenu.classList.add('hidden');
        this.elements.lobbyScreen.classList.add('hidden');
        this.elements.scannerScreen.classList.add('hidden');
        this.elements.challengeHud.classList.add('hidden');
        
        this.clearTimeouts();
        this.elements.submitScoreBtn.disabled = false;
        this.elements.submitScoreBtn.textContent = 'To Submit';
    }

    showChallengeMenu() {
        this.elements.startMenu.classList.add('hidden');
        this.elements.challengeMenu.classList.remove('hidden');
    }

    showLobbyScreen() {
        this.elements.challengeMenu.classList.add('hidden');
        this.elements.lobbyScreen.classList.remove('hidden');
    }

    showScannerScreen() {
        this.elements.challengeMenu.classList.add('hidden');
        this.elements.scannerScreen.classList.remove('hidden');
    }
    
    updateLives(lives) { // lives is float 0-3
        const bars = this.elements.challengeHud.querySelectorAll('.life-fill');
        const fullLives = Math.floor(lives);
        const partialLife = lives - fullLives;

        bars.forEach((bar, index) => {
            if (index < fullLives) {
                bar.style.transform = 'scaleX(1)';
            } else if (index === fullLives) {
                bar.style.transform = `scaleX(${partialLife})`;
            } else {
                bar.style.transform = 'scaleX(0)';
            }
        });
    }

    updateOpponentStatus(name, level, draining) {
        if (name) this.elements.opponentName.textContent = name;
        if (level) this.elements.opponentLevel.textContent = `Lvl ${level}`;
        
        if (draining) {
            this.elements.levelDiffIndicator.classList.remove('hidden');
        } else {
            this.elements.levelDiffIndicator.classList.add('hidden');
        }
    }

    showGameScreen(mode = 'solo') {
        this.elements.startMenu.classList.add('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
        this.elements.challengeMenu.classList.add('hidden');
        this.elements.lobbyScreen.classList.add('hidden');
        this.elements.scannerScreen.classList.add('hidden');
        
        this.elements.scoreDisplay.classList.remove('hidden');
        this.elements.levelDisplay.classList.remove('level-out', 'level-in');
        
        if (mode === 'challenge') {
            this.elements.challengeHud.classList.remove('hidden');
            this.elements.scoreDisplay.classList.add('hidden'); // Hide score in challenge, focus on lives/survival? Or keep it? Prompt doesn't say. Let's keep simple.
        } else {
            this.elements.challengeHud.classList.add('hidden');
            this.elements.scoreDisplay.classList.remove('hidden');
        }

        // Force reflow
        void this.elements.levelDisplay.offsetWidth;
        setTimeout(() => {
            this.elements.levelDisplay.classList.add('level-in');
        }, 50);
    }

    showGameOverMenu(score) {
        this.elements.gameOverMenu.classList.remove('hidden');
        this.elements.scoreDisplay.classList.add('hidden');
        this.elements.levelDisplay.classList.remove('level-in', 'level-out');
        this.elements.finalScoreEl.textContent = score;
        
        const gameOverButtons = this.elements.gameOverMenu.querySelectorAll('button');
        gameOverButtons.forEach(btn => btn.disabled = true);

        // Reset submit button text before it appears
        this.elements.submitScoreBtn.textContent = 'To Submit';
        
        this.gameOverButtonTimeout = setTimeout(() => {
            gameOverButtons.forEach(btn => btn.disabled = false);
        }, 800); // 0.8 second delay

        this.levelFadeTimeout = setTimeout(() => {
            this.elements.levelDisplay.classList.add('hidden');
        }, 3000);
    }

    updateScore(score) {
        this.elements.scoreEl.textContent = score;
    }

    updateLevel(level, isInitial = false) {
        const levelDisplay = this.elements.levelDisplay;
        
        if (isInitial) {
            levelDisplay.classList.remove('hidden'); // Ensure it's visible
            levelDisplay.textContent = level;
            levelDisplay.classList.remove('level-in', 'level-out');
            // Force reflow
            void levelDisplay.offsetWidth;
            setTimeout(() => {
                levelDisplay.classList.add('level-in');
            }, 50);
            return;
        }

        levelDisplay.classList.remove('level-in');
        levelDisplay.classList.add('level-out');

        const onOutAnimationEnd = () => {
            levelDisplay.removeEventListener('animationend', onOutAnimationEnd);
            levelDisplay.textContent = level;
            levelDisplay.classList.remove('level-out');
            levelDisplay.classList.add('level-in');

            const onInAnimationEnd = () => {
                levelDisplay.removeEventListener('animationend', onInAnimationEnd);
                levelDisplay.classList.remove('level-in');
            };
            levelDisplay.addEventListener('animationend', onInAnimationEnd, { once: true });
        };
        levelDisplay.addEventListener('animationend', onOutAnimationEnd, { once: true });
    }

    showReplayContainer() {
        this.elements.replayContainer.classList.remove('hidden');
        this.elements.gameOverMenu.classList.add('hidden');
    }

    hideReplayContainer(origin = 'gameover') {
        this.elements.replayContainer.classList.add('hidden');
        if (origin === 'leaderboard') {
            this.elements.leaderboardView.classList.remove('hidden');
        } else {
            this.elements.gameOverMenu.classList.remove('hidden');
        }
    }

    showLeaderboardView() {
        this.elements.startMenu.classList.add('hidden');
        this.elements.leaderboardView.classList.remove('hidden');
    }

    hideLeaderboardView() {
        this.elements.leaderboardView.classList.add('hidden');
        this.elements.startMenu.classList.remove('hidden');
    }

    showPagination() {
        this.elements.leaderboardPagination.classList.remove('hidden');
    }

    hidePagination() {
        this.elements.leaderboardPagination.classList.add('hidden');
    }

    setSubmitButtonState(state, text) {
        this.elements.submitScoreBtn.disabled = state === 'disabled';
        this.elements.submitScoreBtn.textContent = text;
    }

    clearTimeouts() {
        if (this.levelFadeTimeout) {
            clearTimeout(this.levelFadeTimeout);
            this.levelFadeTimeout = null;
        }
        if (this.gameOverButtonTimeout) {
            clearTimeout(this.gameOverButtonTimeout);
            this.gameOverButtonTimeout = null;
        }
    }
}

export function getUIElements() {
    return {
        scoreDisplay: document.getElementById('score-display'),
        scoreEl: document.getElementById('score'),
        levelDisplay: document.getElementById('level-display'),
        startMenu: document.getElementById('start-menu'),
        gameOverMenu: document.getElementById('game-over-menu'),
        finalScoreEl: document.getElementById('final-score'),
        restartBtn: document.getElementById('restart-btn'),
        homeBtn: document.getElementById('home-btn'),
        difficultyBtns: document.querySelectorAll('.difficulty-btn'),
        replayBtn: document.getElementById('replay-btn'),
        replayContainer: document.getElementById('replay-container'),
        closeReplayBtn: document.getElementById('close-replay-btn'),
        submitScoreBtn: document.getElementById('submit-score-btn'),
        leaderboardBtn: document.getElementById('leaderboard-btn'),
        leaderboardView: document.getElementById('leaderboard-view'),
        closeLeaderboardBtn: document.getElementById('close-leaderboard-btn'),
        leaderboardList: document.getElementById('leaderboard-list'),
        leaderboardDifficultyFilters: document.getElementById('leaderboard-difficulty-filters'),
        leaderboardFilterBtns: document.querySelectorAll('.leaderboard-filter-btn'),
        leaderboardPagination: document.getElementById('leaderboard-pagination'),
        // Challenge Mode
        challengeModeBtn: document.getElementById('challenge-mode-btn'),
        challengeMenu: document.getElementById('challenge-menu'),
        hostGameBtn: document.getElementById('host-game-btn'),
        joinGameBtn: document.getElementById('join-game-btn'),
        challengeBackBtn: document.getElementById('challenge-back-btn'),
        lobbyScreen: document.getElementById('lobby-screen'),
        qrCanvas: document.getElementById('qr-canvas'),
        connectionStatus: document.getElementById('connection-status'),
        cancelHostBtn: document.getElementById('cancel-host-btn'),
        scannerScreen: document.getElementById('scanner-screen'),
        scannerVideo: document.getElementById('scanner-video'),
        cancelScanBtn: document.getElementById('cancel-scan-btn'),
        challengeHud: document.getElementById('challenge-hud'),
        opponentName: document.querySelector('.opponent-name'),
        opponentLevel: document.querySelector('.opponent-level'),
        levelDiffIndicator: document.querySelector('.level-diff-indicator'),
        // New elements
        playersList: document.getElementById('players-list'),
        refreshPlayersBtn: document.getElementById('refresh-players-btn'),
        invitesList: document.getElementById('invites-list'),
        inviteBadge: document.getElementById('invite-badge'),
        challengeTabs: document.querySelectorAll('.challenge-tab'),
        challengeTabViews: document.querySelectorAll('.tab-view'),
        challengeDiffBtns: document.querySelectorAll('.challenge-diff-btn')
    };
}