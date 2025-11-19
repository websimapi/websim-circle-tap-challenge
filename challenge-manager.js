import QRCode from 'qrcode';
import { network, room } from './network.js';
import { Scanner } from './scanner.js';

export class ChallengeManager {
    constructor(game, ui, elements) {
        this.game = game;
        this.ui = ui;
        this.elements = elements;

        this.isHost = false;
        this.challengeDifficulty = 'medium';
        this.currentUser = null;
        this.scanner = null;

        this.bindEvents();
        this.setupNetwork();
        this.startPeerRefresh();
    }

    bindEvents() {
        // Menu Buttons
        this.elements.challengeModeBtn.addEventListener('click', () => this.openMenu());
        this.elements.challengeBackBtn.addEventListener('click', () => this.ui.showStartMenu());

        // Host / Join
        this.elements.hostGameBtn.addEventListener('click', () => this.handleHostClick());
        this.elements.cancelHostBtn.addEventListener('click', () => this.cancelHost());
        this.elements.joinGameBtn.addEventListener('click', () => this.startScanning());
        this.elements.cancelScanBtn.addEventListener('click', () => this.stopScanning());

        // Tabs & Difficulty
        this.elements.challengeTabs.forEach(tab => {
            tab.addEventListener('click', () => this.ui.switchChallengeTab(tab.dataset.tab));
        });

        this.elements.challengeDiffBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.challengeDiffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.challengeDifficulty = btn.dataset.difficulty;
            });
        });

        // Lists
        this.elements.playersList.addEventListener('click', (e) => this.handlePlayerListClick(e));
        this.elements.invitesList.addEventListener('click', (e) => this.handleInviteListClick(e));
        if (this.elements.refreshPlayersBtn) {
            this.elements.refreshPlayersBtn.addEventListener('click', (e) => this.manualRefresh(e));
        }
    }

    setupNetwork() {
        network.on('onConnect', (metadata) => {
            console.log("Connected to peer!");
            this.elements.connectionStatus.textContent = "Opponent Connected!";
            this.stopScanning(); // If we were scanning

            if (this.isHost) {
                setTimeout(() => {
                    network.send({ type: 'START', difficulty: this.challengeDifficulty });
                    this.startGame(this.challengeDifficulty);
                }, 1000);
            }
        });

        network.on('onData', (data) => {
            if (data.type === 'START') {
                this.startGame(data.difficulty || 'medium');
            } else if (data.type === 'UPDATE') {
                this.ui.updateOpponentStatus(null, data.level, this.game.level < data.level);
                this.game.setOpponentLevel(data.level);
            } else if (data.type === 'GAMEOVER') {
                if (this.game.gameState === 'playing') {
                    // Opponent died. 
                    // Logic: Game ends, we win? Or we survive?
                    // Simple version: Show win message, end game.
                    alert("Opponent Eliminated! You Win!");
                    this.game.gameOver(); // Technically ends our run too
                }
            } else if (data.type === 'HELLO') {
                this.ui.updateOpponentStatus(data.username, 1, false);
            }
        });

        network.on('onDisconnect', () => {
            if (this.game.mode === 'challenge' && this.game.gameState === 'playing') {
                alert("Opponent disconnected.");
                this.game.gameOver();
            }
            this.ui.showStartMenu();
        });

        network.on('onPeerList', (peers) => this.updatePeerList(peers));
        network.on('onChallenge', (inviteData) => this.ui.addInvite(inviteData));

        // Bind game updates
        this.game.onChallengeUpdate = (data) => {
            // This would be called if we refactor Game to emit distinct challenge events
            // For now, script.js hooks into onScoreUpdate etc. 
            // We will wire that up in script.js to call methods here, or do it here.
        };
    }

    sendUpdate() {
        if (this.game.mode === 'challenge') {
            network.send({
                type: 'UPDATE',
                score: this.game.score,
                level: this.game.level,
                lives: this.game.lives
            });
        }
    }

    sendGameOver() {
        if (this.game.mode === 'challenge') {
            network.send({ type: 'GAMEOVER', score: this.game.score, level: this.game.level });
        }
    }

    startGame(difficulty) {
        this.game.start(difficulty, 'challenge');
        this.ui.showGameScreen('challenge');
        this.sendUpdate();
    }

    openMenu() {
        this.ui.showChallengeMenu();
    }

    async handleHostClick() {
        this.isHost = true;
        const btn = this.elements.hostGameBtn;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Initializing...";

        try {
            this.currentUser = await window.websim.getCurrentUser();
            const id = await network.initPeerJS(this.currentUser.username);

            this.ui.showLobbyScreen();
            this.elements.qrCanvas.style.display = 'block';
            this.elements.connectionStatus.textContent = "Waiting for opponent...";

            const joinUrl = `https://websim.com/@api/circletap?id=${id}`;
            QRCode.toCanvas(this.elements.qrCanvas, joinUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } }, (error) => {
                if (error) console.error('QR generation error:', error);
            });

        } catch (e) {
            console.error("Failed to init host:", e);
            alert("Connection failed. Try again.");
            this.ui.showChallengeMenu();
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    cancelHost() {
        network.close();
        this.ui.showChallengeMenu();
        this.isHost = false;
    }

    async startScanning() {
        this.ui.showScannerScreen();
        if (!this.scanner) {
            this.scanner = new Scanner(
                this.elements.scannerVideo,
                (data) => this.handleScan(data),
                (err) => { alert("Camera error"); this.ui.showChallengeMenu(); }
            );
        }
        await this.scanner.start();
    }

    stopScanning() {
        if (this.scanner) {
            this.scanner.stop();
        }
        this.ui.showChallengeMenu();
    }

    handleScan(data) {
        console.log("QR Code:", data);
        try {
            let joinId = null;
            if (data.includes('?id=')) {
                const url = new URL(data);
                joinId = url.searchParams.get('id');
            } else if (data.includes('?join=')) { // Legacy support
                const url = new URL(data);
                joinId = url.searchParams.get('join');
            }

            if (joinId) {
                this.scanner.stop();
                this.connectToHost(joinId);
            }
        } catch (e) {
            console.warn("Invalid QR data", e);
        }
    }

    async connectToHost(peerId) {
        this.isHost = false;
        try {
            this.ui.showLobbyScreen();
            this.elements.qrCanvas.style.display = 'none';
            this.elements.connectionStatus.textContent = "Connecting...";

            if (!this.currentUser) this.currentUser = await window.websim.getCurrentUser();
            await network.initPeerJS(this.currentUser.username + '_guest_' + Math.floor(Math.random() * 1000));

            network.connectToPeer(peerId, { username: this.currentUser.username });
        } catch (e) {
            console.error("Connection failed", e);
            alert("Connection failed");
            this.ui.showChallengeMenu();
        }
    }

    // Real-time List Logic
    updatePeerList(peers) {
        if (!peers) return;
        const peersList = Object.entries(peers).map(([id, data]) => ({ id, ...data }));
        const otherPeers = peersList.filter(p => p.id !== room.clientId);
        this.ui.updatePlayerList(otherPeers);
    }

    startPeerRefresh() {
        setInterval(() => {
            const playersView = document.getElementById('players-view');
            if (!this.elements.challengeMenu.classList.contains('hidden') &&
                playersView && playersView.classList.contains('active')) {
                this.refreshPlayerList();
            }
        }, 4000);
    }

    refreshPlayerList() {
        if (!room || !room.peers) return;
        this.updatePeerList(room.peers);
    }

    manualRefresh(e) {
        const btn = e.target;
        const originalText = btn.textContent;
        btn.textContent = '...';
        btn.disabled = true;
        this.refreshPlayerList();
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 500);
    }

    async handlePlayerListClick(e) {
        if (e.target.classList.contains('challenge-player-btn')) {
            const targetId = e.target.dataset.id;
            const btn = e.target;

            this.isHost = true;
            const originalText = btn.textContent;
            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                if (!this.currentUser) this.currentUser = await window.websim.getCurrentUser();
                await network.initPeerJS(this.currentUser.username);

                await network.sendChallengeInvite(targetId);
                btn.textContent = 'Sent!';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            } catch (err) {
                console.error("Failed to challenge:", err);
                btn.textContent = 'Error';
                btn.disabled = false;
            }
        }
    }

    handleInviteListClick(e) {
        if (e.target.classList.contains('accept-btn')) {
            const peerId = e.target.dataset.peer;
            const senderId = e.target.dataset.id;

            this.isHost = false;
            this.ui.removeInvite(senderId);
            this.connectToHost(peerId);

        } else if (e.target.classList.contains('reject-btn')) {
            const senderId = e.target.dataset.id;
            network.rejectChallenge(senderId);
            this.ui.removeInvite(senderId);
        }
    }
}