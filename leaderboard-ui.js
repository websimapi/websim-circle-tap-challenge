import { fetchLeaderboard, renderLeaderboardList, renderLeaderboardPagination, syncScores } from './leaderboard.js';
import { showReplay } from './replay.js';
import { fadeOutMusic } from './audio.js';

export class LeaderboardUIManager {
    constructor(uiController, elements) {
        this.ui = uiController;
        this.elements = elements;

        // State
        this.rankedPlayersData = [];
        this.allDifficultiesData = { easy: null, medium: null, hard: null };
        this.state = {
            currentPage: 1,
            totalPages: 1,
            itemsPerPage: 10,
            currentDifficulty: 'easy',
            isMyScoresActive: false
        };
        this.currentUser = null;

        this.bindEvents();
    }

    bindEvents() {
        // Difficulty Filters
        this.elements.leaderboardDifficultyFilters.addEventListener('click', (e) => this.handleFilterClick(e));

        // Pagination
        this.elements.leaderboardPagination.addEventListener('click', (e) => this.handlePaginationClick(e));
        this.elements.leaderboardPagination.addEventListener('change', (e) => this.handlePaginationInput(e));

        // Replay Watching & Expansion
        this.elements.leaderboardList.addEventListener('click', (e) => this.handleListClick(e));

        // Close
        this.elements.closeLeaderboardBtn.addEventListener('click', () => {
            this.ui.hideLeaderboardView();
        });
    }

    async open() {
        // Trigger a first interaction callback if needed externally, but usually handled by button click
        syncScores();
        await this.load('easy');
    }

    async load(difficulty) {
        this.state.currentDifficulty = difficulty;
        this.state.isMyScoresActive = false;
        this.state.currentPage = 1;

        this.ui.showLeaderboardView();
        this.elements.leaderboardList.innerHTML = '<p>Loading scores...</p>';
        this.ui.hidePagination();
        this.rankedPlayersData = [];

        // Update UI buttons
        this.elements.leaderboardFilterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
        });
        document.getElementById('my-scores-btn').classList.remove('active');

        try {
            if (this.allDifficultiesData[difficulty]) {
                this.rankedPlayersData = this.allDifficultiesData[difficulty];
            } else {
                this.rankedPlayersData = await fetchLeaderboard(difficulty);
                this.allDifficultiesData[difficulty] = this.rankedPlayersData;
            }

            this.updatePaginationState();

            if (this.rankedPlayersData.length === 0) {
                this.elements.leaderboardList.innerHTML = `<p>No scores for ${difficulty} difficulty yet. Be the first!</p>`;
                this.ui.hidePagination();
            } else {
                this.render();
                this.ui.showPagination();
            }
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            this.elements.leaderboardList.innerHTML = '<p>Could not load leaderboard. Please try again later.</p>';
            this.ui.hidePagination();
        }
    }

    updatePaginationState() {
        let dataLen = this.rankedPlayersData.length;
        if (this.state.isMyScoresActive && this.currentUser) {
            const myData = this.rankedPlayersData.find(p => p.username === this.currentUser.username);
            dataLen = myData ? 1 : 0;
        }
        this.state.totalPages = Math.ceil(dataLen / this.state.itemsPerPage);
    }

    render() {
        let dataToRender = this.rankedPlayersData;

        if (this.state.isMyScoresActive && this.currentUser) {
            const myData = this.rankedPlayersData.find(p => p.username === this.currentUser.username);
            dataToRender = myData ? [myData] : [];
        }

        this.elements.leaderboardList.innerHTML = renderLeaderboardList(
            dataToRender,
            this.state.currentPage,
            this.state.itemsPerPage
        );

        this.updatePaginationState(); // Ensure total pages is correct

        if (this.state.totalPages > 1) {
            this.elements.leaderboardPagination.innerHTML = renderLeaderboardPagination(
                this.state.totalPages,
                this.state.currentPage
            );
            this.ui.showPagination();
        } else {
            this.ui.hidePagination();
        }
    }

    async handleFilterClick(e) {
        const targetBtn = e.target.closest('.leaderboard-filter-btn');
        if (!targetBtn || targetBtn.classList.contains('active')) return;

        const difficulty = targetBtn.dataset.difficulty;

        if (difficulty === 'mine') {
            await this.switchToMyScores(targetBtn);
        } else {
            this.load(difficulty);
        }
    }

    async switchToMyScores(targetBtn) {
        this.state.isMyScoresActive = true;
        this.state.currentPage = 1;

        this.elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');

        if (!this.currentUser) {
            try {
                this.currentUser = await window.websim.getCurrentUser();
            } catch {
                this.elements.leaderboardList.innerHTML = `<p>Could not verify user. Please try again.</p>`;
                return;
            }
        }

        // Ensure data for current difficulty is loaded
        if (!this.allDifficultiesData[this.state.currentDifficulty]) {
            await this.load(this.state.currentDifficulty);
            // Re-apply My Scores state as load() resets it
            this.state.isMyScoresActive = true;
            this.elements.leaderboardFilterBtns.forEach(btn => btn.classList.remove('active'));
            targetBtn.classList.add('active');
        }

        this.render();
    }

    handlePaginationClick(e) {
        const target = e.target;
        let pageChanged = false;

        if (target.id === 'first-page-btn' && this.state.currentPage > 1) {
            this.state.currentPage = 1;
            pageChanged = true;
        } else if (target.id === 'prev-page-btn' && this.state.currentPage > 1) {
            this.state.currentPage--;
            pageChanged = true;
        } else if (target.id === 'next-page-btn' && this.state.currentPage < this.state.totalPages) {
            this.state.currentPage++;
            pageChanged = true;
        } else if (target.id === 'last-page-btn' && this.state.currentPage < this.state.totalPages) {
            this.state.currentPage = this.state.totalPages;
            pageChanged = true;
        }

        if (pageChanged) {
            this.render();
        }
    }

    handlePaginationInput(e) {
        const target = e.target;
        if (target.id === 'page-input') {
            let newPage = parseInt(target.value, 10);
            if (!isNaN(newPage)) {
                newPage = Math.max(1, Math.min(newPage, this.state.totalPages));
                this.state.currentPage = newPage;
                this.render();
            }
        }
    }

    async handleListClick(e) {
        const watchBtn = e.target.closest('.watch-replay-btn');
        const entry = e.target.closest('.leaderboard-entry');

        if (watchBtn) {
            e.stopPropagation();
            await this.playReplay(watchBtn);
        } else if (entry) {
            const scoreList = entry.nextElementSibling;
            if (scoreList && scoreList.classList.contains('score-list-container')) {
                scoreList.classList.toggle('hidden');
                entry.classList.toggle('expanded');
            }
        }
    }

    async playReplay(watchBtn) {
        const index = watchBtn.dataset.index;
        const scoreIndex = watchBtn.dataset.scoreIndex;
        const playerData = this.rankedPlayersData[index];

        const gameData = scoreIndex !== undefined
            ? playerData.allScores[scoreIndex]
            : playerData.bestGameData;

        if (playerData && gameData && gameData.replayDataUrl) {
            try {
                const originalText = watchBtn.textContent;
                watchBtn.textContent = 'Loading...';
                watchBtn.disabled = true;

                const response = await fetch(gameData.replayDataUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const replayData = await response.json();

                if (!replayData.config.currentUser) {
                    replayData.config.currentUser = {
                        username: playerData.username,
                        avatar_url: `https://images.websim.com/avatar/${playerData.username}`
                    };
                }

                // Signal replay
                fadeOutMusic();
                this.elements.leaderboardView.classList.add('hidden');
                this.ui.showReplayContainer();
                // We dispatch event via the function, but we need to know where we came from to go back
                // The UI controller knows where to go back if we pass an origin, 
                // but ui.showReplayContainer doesn't take args in current ui.js.
                // We'll use the global variable replayOrigin equivalent in script.js logic, 
                // OR rely on the UI controller's hideReplayContainer to accept origin.
                // For now, let's fire the event.
                const event = new CustomEvent('requestReplay', { detail: { data: replayData, origin: 'leaderboard' } });
                window.dispatchEvent(event);

                watchBtn.textContent = originalText;
                watchBtn.disabled = false;

            } catch (error) {
                console.error("Error fetching replay:", error);
                alert("Could not load replay.");
                watchBtn.textContent = 'Failed';
                setTimeout(() => {
                    watchBtn.textContent = 'Watch';
                    watchBtn.disabled = false;
                }, 2000);
            }
        }
    }
}