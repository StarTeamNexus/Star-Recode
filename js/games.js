class GameLibrary {
    constructor() {
        this.frame = document.querySelector(".Projects-Frame");
        this.iframe = document.querySelector(".Projects-IFrame");
        this.container = document.querySelector(".Projects-Container");
        this.searchBar = document.getElementById("GameSearchBar");
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Frame controls
        this.frame.querySelector(".Projects-FrameBar").addEventListener("click", (e) => {
            this.handleFrameControls(e);
        });

        // Search functionality
        this.searchBar.addEventListener("input", () => {
            this.handleSearch();
        });
    }

    handleFrameControls(event) {
        const target = event.target;
        
        if (target.id === "close") {
            this.closeGame();
        } else if (target.id === "fullscreen") {
            this.toggleFullscreen();
        } else if (target.id === "link") {
            const currentGame = this.iframe.src;
            if (currentGame) window.open(currentGame);
        }
    }

    closeGame() {
        this.frame.classList.add("hidden");
        this.iframe.src = "";
    }

    async toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await this.iframe.requestFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen error:', error);
            this.showError('Unable to enter fullscreen mode');
        }
    }

    handleSearch() {
        const searchTerm = this.searchBar.value.trim().toLowerCase();
        const games = this.container.querySelectorAll(".Projects-Project");

        games.forEach(game => {
            const gameName = game.querySelector("h1").textContent.toLowerCase();
            game.classList.toggle("hidden", !gameName.includes(searchTerm));
        });
    }

    createGameElement(game) {
        const project = document.createElement("div");
        project.className = "Projects-Project";
        
        // Create icon URL - assumes icons are in the same folder structure as games
        const iconPath = `${CONFIG.cdnBase}Icons/${game.game.replace(/[.\s]/g, "")}.webp`;
        
        project.innerHTML = `
            <img src="${iconPath}" 
                 loading="lazy" 
                 alt="${game.game} icon"
                 onerror="this.src='${CONFIG.defaultIcon}'"/>
            <h1>${game.game}</h1>
        `;

        project.addEventListener("click", () => {
            this.loadGame(game);
        });

        return project;
    }

    loadGame(game) {
        // Construct the full GitHub Pages URL
        const gameUrl = `${CONFIG.cdnBase}${game.gameroot}`;
        
        this.frame.classList.remove("hidden");
        this.iframe.src = gameUrl;
    }

    showError(message) {
        const error = document.createElement('div');
        error.className = 'error-message';
        error.textContent = message;
        this.container.prepend(error);
        
        setTimeout(() => error.remove(), 5000);
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="loading-indicator">
                <div class="spinner"></div>
                <p>Loading games...</p>
            </div>
        `;
    }

    async loadGames() {
        try {
            this.showLoading();

            // Fetch the games list from GitHub raw content
            const response = await fetch(CONFIG.listFile);
            if (!response.ok) throw new Error('Failed to load games list');
            
            const games = await response.json();
            
            // Clear loading state
            this.container.innerHTML = '';

            // Sort games alphabetically
            games.sort((a, b) => a.game.localeCompare(b.game));

            // Create and append game elements
            const fragment = document.createDocumentFragment();
            games.forEach(game => {
                const gameElement = this.createGameElement(game);
                fragment.appendChild(gameElement);
            });

            this.container.appendChild(fragment);

        } catch (error) {
            console.error('Error loading games:', error);
            this.showError('Unable to load games. Please try again later.');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const gameLibrary = new GameLibrary();
    gameLibrary.loadGames();
});
