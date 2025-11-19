import { Game, difficulties } from './game.js';
import { UIController } from './ui.js';
import { submitScore, fetchLeaderboard, renderLeaderboardList, renderLeaderboardPagination, syncScores, migrateUserScores } from './leaderboard.js';
import { showReplay, hideReplay } from './replay.js';
import { playBackgroundMusic, fadeInMusic, fadeOutMusic } from './audio.js';
import { network, room } from './network.js'; // Import room
import QRCode from 'qrcode';
import jsQR from 'jsqr';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    let hasInteracted = false;

    const handleFirstInteraction = () => {
        if (!hasInteracted) {
            hasInteracted = true;
            playBackgroundMusic();
        }
    };
    
    // UI Elements
    const elements = {
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
        invitesList: document.getElementById('invites-list'),
        inviteBadge: document.getElementById('invite-badge'),
        challengeTabs: document.querySelectorAll('.challenge-tab'),
        challengeTabViews: document.querySelectorAll('.tab-view')
    };

    const game = new Game(canvas);
    const ui = new UIController(elements);
    let scannerInterval = null;
    
    // Game/App state
    let rankedPlayersData = [];
    let allDifficultiesData = { easy: null, medium: null, hard: null };
    let isMyScoresActive = false;
    let currentUser = null;
    let replayOrigin = 'gameover';
    let leaderboardState = {
        currentPage: 1,
        totalPages: 1,
        itemsPerPage: 10,
        currentDifficulty: 'easy'
    };

    // Set up game callbacks
    game.onScoreUpdate = (score) => {
        ui.updateScore(score);
        sendGameUpdate();
    };
    
    game.onLevelUp = (level, isInitial) => {
        ui.updateLevel(level, isInitial);
        sendGameUpdate();
    };

    game.onLivesUpdate = (lives) => {
        ui.updateLives(lives);
        sendGameUpdate();
    };

    game.onGameOver = (gameData) => {
        if (game.mode === 'challenge') {
            network.send({ type: 'GAMEOVER', score: game.score, level: game.level });
            // Show specific challenge game over?
            ui.showGameOverMenu(gameData.score); 
        } else {
            ui.showGameOverMenu(gameData.score);
        }
    };

    // Helper to send game state
    function sendGameUpdate() {
        if (game.mode === 'challenge') {
            network.send({
                type: 'UPDATE',
                score: game.score,
                level: game.level,
                lives: game.lives
            });
        }
    }

    // Network Callbacks
    network.on('onConnect', (metadata) => {
        console.log("Connected to peer!");
        elements.connectionStatus.textContent = "Opponent Connected!";
        
        // Stop scanner if running
        stopScanner();
        
        // If we are host, send Start game soon
        // Actually, let's wait 1s then start
        setTimeout(() => {
             // We need to agree on difficulty. Default to Medium for Challenge?
             network.send({ type: 'START', difficulty: 'medium' });
             startGameChallenge('medium');
        }, 1000);
    });

    network.on('onData', (data) => {
        if (data.type === 'START') {
            startGameChallenge(data.difficulty || 'medium');
        } else if (data.type === 'UPDATE') {
            ui.updateOpponentStatus(null, data.level, game.level < data.level);
            game.setOpponentLevel(data.level);
        } else if (data.type === 'GAMEOVER') {
            // Opponent died. We win!
            // Unless we are already dead?
            if (game.gameState === 'playing') {
                 // We win logic
                 alert("You Won!"); // Placeholder, improve later
                 game.gameOver(); // End our game
            } else {
                 // Double KO? Or we already lost.
            }
        } else if (data.type === 'HELLO') {
            ui.updateOpponentStatus(data.username, 1, false);
        }
    });

    network.on('onDisconnect', () => {
        if (game.mode === 'challenge' && game.gameState === 'playing') {
             alert("Opponent disconnected.");
             game.gameOver();
        }
        ui.showStartMenu();
    });

    function startGameChallenge(difficulty) {
        game.start(difficulty, 'challenge');
        ui.showGameScreen('challenge');
        // Send our initial info
        sendGameUpdate();
    }

    // Challenge UI Handlers
    elements.challengeModeBtn.addEventListener('click', () => {
        handleFirstInteraction();
        ui.showChallengeMenu();
        refreshPlayerList();
    });

    elements.challengeBackBtn.addEventListener('click', () => {
        ui.showStartMenu();
    });

    elements.hostGameBtn.addEventListener('click', async () => {
        const btn = elements.hostGameBtn;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Initializing...";

        try {
            currentUser = await window.websim.getCurrentUser();
            const id = await network.init(currentUser.username);
            
            ui.showLobbyScreen();
            elements.qrCanvas.style.display = 'block';
            elements.connectionStatus.textContent = "Waiting for opponent...";
            
            // Generate URL for QR with 'id' parameter
            const joinUrl = `https://websim.com/@api/circletap?id=${id}`;

            QRCode.toCanvas(elements.qrCanvas, joinUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } }, function (error) {
                if (error) console.error('QR generation error:', error);
            });

        } catch (e) {
            console.error("Failed to init host:", e);
            alert("Could not start host connection. Please refresh and try again.");
            ui.showChallengeMenu();
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    elements.cancelHostBtn.addEventListener('click', () => {
        network.close();
        ui.showChallengeMenu();
    });

    elements.joinGameBtn.addEventListener('click', () => {
        startScanner();
    });

    elements.cancelScanBtn.addEventListener('click', () => {
        stopScanner();
        ui.showChallengeMenu();
    });

    // Scanner Logic
    async function startScanner() {
        ui.showScannerScreen();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            elements.scannerVideo.srcObject = stream;
            elements.scannerVideo.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            elements.scannerVideo.play();
            
            // Wait for video to be ready
            requestAnimationFrame(tickScanner);
        } catch (e) {
            console.error("Camera error:", e);
            alert("Could not access camera.");
            ui.showChallengeMenu();
        }
    }

    function stopScanner() {
        if (elements.scannerVideo.srcObject) {
            elements.scannerVideo.srcObject.getTracks().forEach(track => track.stop());
            elements.scannerVideo.srcObject = null;
        }
        if (scannerInterval) {
            cancelAnimationFrame(scannerInterval);
            scannerInterval = null;
        }
    }

    function tickScanner() {
        if (elements.scannerVideo.readyState === elements.scannerVideo.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement("canvas");
            canvas.width = elements.scannerVideo.videoWidth;
            canvas.height = elements.scannerVideo.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(elements.scannerVideo, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                console.log("Found QR code", code.data);
                // Parse URL
                try {
                    let joinId = null;
                    // Check for explicit id param first (from prompt spec)
                    if (code.data.includes('?id=')) {
                         const url = new URL(code.data);
                         joinId = url.searchParams.get('id');
                    } 
                    // Check for old join param just in case
                    else if (code.data.includes('?join=')) {
                         const url = new URL(code.data);
                         joinId = url.searchParams.get('join');
                    }

                    if (joinId) {
                        stopScanner();
                        connectToHost(joinId);
                        return;
                    }
                } catch (e) {
                    console.warn("Invalid QR data", e);
                }
            }
        }
        scannerInterval = requestAnimationFrame(tickScanner);
    }

    async function connectToHost(peerId) {
        try {
            ui.showLobbyScreen();
            elements.qrCanvas.style.display = 'none'; // Hide QR in joining lobby
            elements.connectionStatus.textContent = "Connecting...";
            
            currentUser = await window.websim.getCurrentUser();
            await network.init(currentUser.username + '_guest_' + Math.floor(Math.random()*1000));
            
            network.connectToPeer(peerId, { username: currentUser.username });
            
            network.send({ type: 'HELLO', username: currentUser.username });
        } catch (e) {
            console.error("Connection failed", e);
            alert("Connection failed");
            ui.showChallengeMenu();
        }
    }

    // Check for URL params on load
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('id') || urlParams.get('join');
    if (joinId) {
        // Auto join
        // Need to wait for user interaction? "handleFirstInteraction"
        // We can show a "Click to Join" modal or just go to lobby
        // Browsers block AudioContext if no interaction.
        // Let's show a "Join Match" button overlay or jump to lobby but wait for start.
        
        // Simulating interaction via a temporary start button might be better UX
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.8)';
        overlay.style.color = 'white';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        overlay.innerHTML = '<button style="padding: 20px; font-size: 20px;">Tap to Join Match</button>';
        document.body.appendChild(overlay);
        
        overlay.querySelector('button').onclick = () => {
            handleFirstInteraction();
            overlay.remove();
            connectToHost(joinId);
        };
    }

    // Difficulty selection
    elements.difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            handleFirstInteraction();
            game.start(btn.dataset.difficulty, 'solo'); // Explicitly solo
            ui.showGameScreen('solo');
        });
    });

    // Restart button
    elements.restartBtn.addEventListener('click', () => {
        ui.clearTimeouts();
        game.reset();
        ui.showGameScreen(game.mode); // Keep mode
        // If challenge, we probably need to rematch? 
        // For now, restart is solo only or restarts solo.
        // Ideally: "Rematch" button for challenge. 
        // If in challenge mode, restart button might need to act differently.
        // Prompt didn't specify rematch logic, assume "Retry" goes to solo or resets level.
        // Let's force solo on retry for now to avoid desync.
        game.start(game.currentDifficulty, 'solo'); 
    });

    // Home button
    elements.homeBtn.addEventListener('click', () => {
        ui.clearTimeouts();
        game.reset();
        ui.showStartMenu();
    });

    // Replay button
    elements.replayBtn.addEventListener('click', async () => {
        handleFirstInteraction();
        replayOrigin = 'gameover';
        fadeOutMusic();
        ui.showReplayContainer();
        
        if (!game.replayConfig.currentUser) {
            try {
                const currentUser = await window.websim.getCurrentUser();
                game.replayConfig.currentUser = currentUser;
            } catch (error) {
                console.error("Could not get current user for replay:", error);
                game.replayConfig.currentUser = null;
            }
        }

        showReplay({
            frames: game.replayFrames,
            config: game.replayConfig
        });
    });

    elements.closeReplayBtn.addEventListener('click', () => {
        ui.hideReplayContainer(replayOrigin);
        hideReplay();
        fadeInMusic();
    });

    // Submit score button
    elements.submitScoreBtn.addEventListener('click', async () => {
        ui.setSubmitButtonState('disabled', 'Submitting...');
        
        await submitScore(
            game.lastGameData,
            () => ui.setSubmitButtonState('disabled', 'Submitted!'),
            () => {
                ui.setSubmitButtonState('disabled', 'Error!');
                setTimeout(() => {
                    ui.setSubmitButtonState('enabled', 'To Submit');
                }, 2000);
            }
        );
    });

    async function updateLeaderboardView() {
        const { currentPage, itemsPerPage } = leaderboardState;
        let dataToRender = rankedPlayersData;
        
        if (isMyScoresActive && currentUser) {
            const myData = rankedPlayersData.find(p => p.username === currentUser.username);
            dataToRender = myData ? [myData] : [];
        }

        elements.leaderboardList.innerHTML = renderLeaderboardList(dataToRender, currentPage, itemsPerPage);
        
        const totalPages = Math.ceil(dataToRender.length / itemsPerPage);
        leaderboardState.totalPages = totalPages;

        if (totalPages > 1) {
            elements.leaderboardPagination.innerHTML = renderLeaderboardPagination(totalPages, currentPage);
            ui.showPagination();
        } else {
            ui.hidePagination();
        }
    }

    async function loadLeaderboard(difficulty) {
        leaderboardState.currentDifficulty = difficulty;
        isMyScoresActive = false; // Reset 'My Scores' view when changing difficulty
        leaderboardState.currentPage = 1;
        
        ui.showLeaderboardView();
        elements.leaderboardList.innerHTML = '<p>Loading scores...</p>';
        ui.hidePagination();
        rankedPlayersData = [];

        // Update active button state
        elements.leaderboardFilterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
        });
        document.getElementById('my-scores-btn').classList.remove('active');

        try {
            // Use cached data if available
            if (allDifficultiesData[difficulty]) {
                rankedPlayersData = allDifficultiesData[difficulty];
            } else {
                rankedPlayersData = await fetchLeaderboard(difficulty);
                allDifficultiesData[difficulty] = rankedPlayersData; // Cache it
            }
            
            leaderboardState.totalPages = Math.ceil(rankedPlayersData.length / leaderboardState.itemsPerPage);

            if (rankedPlayersData.length === 0) {
                elements.leaderboardList.innerHTML = `<p>No scores for ${difficulty} difficulty yet. Be the first!</p>`;
                ui.hidePagination();
            } else {
                updateLeaderboardView();
                ui.showPagination();
            }
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            elements.leaderboardList.innerHTML = '<p>Could not load leaderboard. Please try again later.</p>';
            ui.hidePagination();
        }
    }

    // Leaderboard button
    elements.leaderboardBtn.addEventListener('click', async () => {
        handleFirstInteraction();
        syncScores(); // Sync scores when leaderboard is opened
        loadLeaderboard('easy'); // Default to easy
    });

    elements.leaderboardDifficultyFilters.addEventListener('click', async (e) => {
        const targetBtn = e.target.closest('.leaderboard-filter-btn');
        if (!targetBtn || targetBtn.classList.contains('active')) return;
        
        const difficulty = targetBtn.dataset.difficulty;

        if (difficulty === 'mine') {
            isMyScoresActive = true;
            leaderboardState.currentPage = 1;
            
            // Set active states
            elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
            targetBtn.classList.add('active');
            
            if (!currentUser) {
                try {
                    currentUser = await window.websim.getCurrentUser();
                } catch {
                     elements.leaderboardList.innerHTML = `<p>Could not verify user. Please try again.</p>`;
                     return;
                }
            }

            // Load data for current difficulty if not already loaded
            if (!allDifficultiesData[leaderboardState.currentDifficulty]) {
                await loadLeaderboard(leaderboardState.currentDifficulty);
                // After loading, re-apply the "My Scores" filter
                elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
                targetBtn.classList.add('active');
            }
            
            updateLeaderboardView();
            
        } else if (!targetBtn.classList.contains('active')) {
            loadLeaderboard(difficulty);
        }
    });

    elements.leaderboardPagination.addEventListener('click', (e) => {
        const target = e.target;
        let pageChanged = false;
        
        if (target.id === 'first-page-btn' && leaderboardState.currentPage > 1) {
            leaderboardState.currentPage = 1;
            pageChanged = true;
        } else if (target.id === 'prev-page-btn' && leaderboardState.currentPage > 1) {
            leaderboardState.currentPage--;
            pageChanged = true;
        } else if (target.id === 'next-page-btn' && leaderboardState.currentPage < leaderboardState.totalPages) {
            leaderboardState.currentPage++;
            pageChanged = true;
        } else if (target.id === 'last-page-btn' && leaderboardState.currentPage < leaderboardState.totalPages) {
            leaderboardState.currentPage = leaderboardState.totalPages;
            pageChanged = true;
        }

        if (pageChanged) {
            updateLeaderboardView();
        }
    });

    elements.leaderboardPagination.addEventListener('change', (e) => {
        const target = e.target;
        if (target.id === 'page-input') {
            let newPage = parseInt(target.value, 10);
            if (!isNaN(newPage)) {
                newPage = Math.max(1, Math.min(newPage, leaderboardState.totalPages));
                leaderboardState.currentPage = newPage;
                updateLeaderboardView();
            }
        }
    });

    elements.closeLeaderboardBtn.addEventListener('click', () => {
        ui.hideLeaderboardView();
    });

    // Leaderboard replay buttons
    elements.leaderboardList.addEventListener('click', async (e) => {
        const watchBtn = e.target.closest('.watch-replay-btn');
        const entry = e.target.closest('.leaderboard-entry');

        if (watchBtn) {
            e.stopPropagation();
            const index = watchBtn.dataset.index;
            const scoreIndex = watchBtn.dataset.scoreIndex;
            const playerData = rankedPlayersData[index];
            
            const gameData = scoreIndex !== undefined
                ? playerData.allScores[scoreIndex]
                : playerData.bestGameData;

            if (playerData && gameData && gameData.replayDataUrl) {
                try {
                    const originalText = watchBtn.textContent;
                    watchBtn.textContent = 'Loading...';
                    watchBtn.disabled = true;

                    const response = await fetch(gameData.replayDataUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const replayData = await response.json();

                    if (!replayData.config.currentUser) {
                        replayData.config.currentUser = {
                            username: playerData.username,
                            avatar_url: `https://images.websim.com/avatar/${playerData.username}`
                        };
                    }

                    replayOrigin = 'leaderboard';
                    fadeOutMusic();
                    elements.leaderboardView.classList.add('hidden');
                    ui.showReplayContainer();
                    showReplay(replayData);
                    
                    watchBtn.textContent = originalText;
                    watchBtn.disabled = false;

                } catch (fetchError) {
                    console.error("Error fetching replay data:", fetchError);
                    alert("Could not load replay.");
                    watchBtn.textContent = 'Failed';
                    setTimeout(() => {
                        watchBtn.textContent = 'Watch';
                        watchBtn.disabled = false;
                    }, 2000);
                }
            }
        } else if (entry) {
            const scoreList = entry.nextElementSibling;
            if (scoreList && scoreList.classList.contains('score-list-container')) {
                scoreList.classList.toggle('hidden');
                entry.classList.toggle('expanded');
            }
        }
    });

    // Tap handler
    const tapHandler = (e) => {
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            game.handleTap();
        }
    };
    window.addEventListener('pointerdown', tapHandler);
    
    // Spacebar handler
    const spacebarHandler = (e) => {
        if (e.code === 'Space') {
            const focusedElement = document.activeElement;
            // If an element that expects text input is focused (e.g., the page input), don't trigger game tap.
            if (
                focusedElement && 
                (focusedElement.tagName === 'INPUT' && focusedElement.type !== 'submit' && focusedElement.type !== 'button' && focusedElement.type !== 'reset' || 
                 focusedElement.tagName === 'TEXTAREA')
            ) {
                return;
            }

            e.preventDefault();
            handleFirstInteraction();
            game.handleTap();
        }
    };
    window.addEventListener('keydown', spacebarHandler);

    // Window resize
    window.addEventListener('resize', () => game.resizeCanvas());

    // Network Listeners for Challenge List
    network.on('onPeerList', (peersMap) => {
        if (!peersMap) return;

        // Parse peers map to array and ensure ID is attached
        const peersArray = Object.entries(peersMap).map(([id, peer]) => ({
            ...peer,
            id
        }));
        
        const myId = room.clientId;
        // Filter out our own user strictly
        const otherPeers = myId ? peersArray.filter(p => p.id !== myId) : [];
        ui.updatePlayerList(otherPeers);
    });

    const refreshPlayerList = () => {
        if (room.peers) {
            const peersArray = Object.entries(room.peers).map(([id, peer]) => ({
                ...peer,
                id
            }));
            const myId = room.clientId;
            const otherPeers = myId ? peersArray.filter(p => p.id !== myId) : [];
            ui.updatePlayerList(otherPeers);
        }
    };

    // Initial refresh and follow-up to ensure list is populated after connection
    refreshPlayerList();
    setTimeout(refreshPlayerList, 1000);
    // Check every 5 seconds for new users
    setInterval(refreshPlayerList, 5000);

    network.on('onChallenge', (inviteData) => {
        ui.addInvite(inviteData);
    });

    // Challenge Mode Tabs
    elements.challengeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            ui.switchChallengeTab(tab.dataset.tab);
        });
    });

    // Player List Delegate
    elements.playersList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('challenge-player-btn')) {
            const targetId = e.target.dataset.id;
            const btn = e.target;
            
            const originalText = btn.textContent;
            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                // Initialize PeerJS if needed
                if (!currentUser) currentUser = await window.websim.getCurrentUser();
                await network.initPeerJS(currentUser.username);

                await network.sendChallengeInvite(targetId);
                btn.textContent = 'Sent!';
                
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            } catch (err) {
                console.error("Failed to challenge:", err);
                btn.textContent = 'Error';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 2000);
            }
        }
    });

    // Invites List Delegate
    elements.invitesList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('accept-btn')) {
            const peerId = e.target.dataset.peer;
            const senderId = e.target.dataset.id;
            
            ui.removeInvite(senderId); // Remove from list

            // Connect
            connectToHost(peerId);
            
        } else if (e.target.classList.contains('reject-btn')) {
            const senderId = e.target.dataset.id;
            network.rejectChallenge(senderId);
            ui.removeInvite(senderId);
        }
    });

    // Initial setup
    game.reset();
    migrateUserScores();
});