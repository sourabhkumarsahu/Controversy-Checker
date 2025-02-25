class ControversyChecker {
    constructor() {
        // Configuration
        this.config = {
            currentDateTime: '2025-02-24 13:31:57',
            currentUser: '',
            apiPort: 3001
        };

        // DOM Elements
        this.searchInput = document.getElementById('searchInput');
        this.searchButton = document.getElementById('searchButton');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.resultContainer = document.getElementById('resultContainer');
        this.statusMessage = document.getElementById('statusMessage');
        this.newsContainer = document.getElementById('newsContainer');

        this.initialize();
        this.bindEvents();
    }

    async initialize() {
        try {
            const response = await fetch('config.json');
            const config = await response.json();
            this.config.apiPort = config.apiPort;
            console.log('Using API port:', this.config.apiPort);

            // Create header after fetching config
            this.createHeader();
        } catch (error) {
            console.warn('Could not load config.json, using default port:', error);
            this.createHeader(); // Still create header even if config fails
        }
    }

    createHeader() {
        // Create header container if it doesn't exist
        let headerContainer = document.querySelector('.header-container');
        if (!headerContainer) {
            headerContainer = document.createElement('div');
            headerContainer.className = 'header-container bg-gray-100 p-4 mb-6 rounded-lg';

            // Create header content
            headerContainer.innerHTML = `
                <div class="flex justify-between items-center">
                    <h1 class="text-3xl font-bold text-gray-800">Controversy Checker</h1>
                   
            </div>
            `;

            // Insert header at the beginning of the main container
            const mainContainer = document.querySelector('.container');
            if (mainContainer) {
                mainContainer.insertBefore(headerContainer, mainContainer.firstChild);
            }
        }
    }

    bindEvents() {
        this.searchButton.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
    }

    showLoading(show) {
        this.loadingIndicator.classList.toggle('hidden', !show);
        this.searchButton.disabled = show;
        if (show) {
            this.resultContainer.classList.add('hidden');
        }
    }

    async performSearch() {
        const searchTerm = this.searchInput.value.trim();
        if (!searchTerm) {
            this.showError('Please enter a name to search');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`http://localhost:${this.config.apiPort}/api/check-controversy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify({
                    name: searchTerm,
                    timestamp: this.config.currentDateTime,
                    user: this.config.currentUser
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.displayResults(searchTerm, data);
        } catch (error) {
            console.error('Error:', error);
            this.showError(`Error: ${error.message}. Please make sure the server is running.`);
        } finally {
            this.showLoading(false);
        }
    }

    displayResults(searchTerm, data) {
        this.resultContainer.classList.remove('hidden');

        // Create analysis summary
        const summarySection = document.createElement('div');
        summarySection.className = 'mb-6 bg-white p-6 rounded-lg shadow';

        const controversyScore = data.controversyScore || 0;
        const scoreColorClass = controversyScore > 50 ? 'text-red-600' :
            controversyScore > 25 ? 'text-yellow-600' : 'text-green-600';

        summarySection.innerHTML = `
            <div class="text-center">
                <div class="text-2xl font-bold ${scoreColorClass} mb-4">
                    Controversy Score: ${controversyScore}%
                </div>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div class="bg-gray-50 p-3 rounded">
                        <div class="font-semibold">Analysis Period</div>
                        <div>${data.searchPeriod.from} to ${data.searchPeriod.to}</div>
                    </div>
                    <div class="bg-gray-50 p-3 rounded">
                        <div class="font-semibold">Total Articles</div>
                        <div>${data.analysisMetadata.totalArticles} articles analyzed</div>
                    </div>
                </div>
            </div>
        `;

        // Set status message
        this.statusMessage.innerHTML = `
            <div class="text-2xl mb-2">
                ${searchTerm} ${data.hasControversy ?
            '<span class="text-red-600">has significant controversy</span>' :
            '<span class="text-green-600">has minimal controversy</span>'}
            </div>
        `;

        this.statusMessage.className = `text-center mb-6 p-4 rounded-lg ${
            data.hasControversy ? 'bg-red-50' : 'bg-green-50'
        }`;

        // Display results
        this.newsContainer.innerHTML = '';
        this.newsContainer.appendChild(summarySection);

        if (data.results && data.results.length > 0) {
            const resultsList = document.createElement('div');
            resultsList.className = 'space-y-4';

            data.results.forEach((item, index) => {
                const resultCard = this.createResultCard(item, index + 1);
                resultsList.appendChild(resultCard);
            });

            this.newsContainer.appendChild(resultsList);
        } else {
            this.addNoResultsMessage('No news articles found in the specified time period');
        }

        // Add export button
        this.addExportButton(data, searchTerm);
    }

    createResultCard(item, index) {
        const card = document.createElement('div');
        const severity = item.severity || 'NONE';

        const severityColors = {
            HIGH: 'bg-red-50 border-red-200',
            MEDIUM: 'bg-yellow-50 border-yellow-200',
            LOW: 'bg-blue-50 border-blue-200',
            NONE: 'bg-white border-gray-200'
        };

        card.className = `p-4 rounded-lg shadow transition duration-200 ${severityColors[severity]}`;

        const date = new Date(item.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        let sentimentHtml = '';
        if (item.sentiment) {
            const sentimentScore = item.sentiment.comparative;
            const sentimentClass = sentimentScore < 0 ? 'text-red-600' : 'text-green-600';
            sentimentHtml = `
                <div class="mt-2">
                    <span class="text-sm ${sentimentClass}">
                        Sentiment: ${(sentimentScore * 100).toFixed(1)}%
                    </span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="flex items-start space-x-4">
                <div class="flex-shrink-0 w-8 h-8 ${
            severity !== 'NONE' ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500'
        } rounded-full flex items-center justify-center font-semibold">
                    ${index}
                </div>
                <div class="flex-grow">
                    <a href="${item.link}" target="_blank" class="block">
                        <h4 class="font-medium text-gray-900 hover:text-blue-600 mb-1">${item.title}</h4>
                        <div class="flex items-center text-sm text-gray-500 space-x-2">
                            <span>${date}</span>
                            <span>•</span>
                            <span>${item.source}</span>
                            <span>•</span>
                            <span>Severity: ${severity}</span>
                        </div>
                        ${sentimentHtml}
                    </a>
                </div>
            </div>
        `;

        return card;
    }

    addNoResultsMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'text-center text-gray-600 py-4';
        messageDiv.textContent = message;
        this.newsContainer.appendChild(messageDiv);
    }

    showError(message) {
        this.resultContainer.classList.remove('hidden');
        this.statusMessage.textContent = message;
        this.statusMessage.className = 'text-xl font-semibold text-center mb-4 text-red-600 bg-red-50 p-4 rounded-lg';
        this.newsContainer.innerHTML = '';
    }

    addExportButton(data, searchTerm) {
        const exportButton = document.createElement('button');
        exportButton.className = 'mt-6 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition duration-200 w-full';
        exportButton.textContent = 'Export Results';
        exportButton.onclick = () => this.exportResults(data, searchTerm);
        this.newsContainer.appendChild(exportButton);
    }

    exportResults(data, searchTerm) {
        const exportData = {
            searchInfo: {
                term: searchTerm,
                user: this.config.currentUser,
                timestamp: this.config.currentDateTime,
                period: data.searchPeriod
            },
            controversyAnalysis: {
                hasControversy: data.hasControversy,
                controversyScore: data.controversyScore,
                controversyTypes: data.controversyTypes
            },
            results: data.results
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `controversy-check-${searchTerm}-${this.config.currentDateTime.replace(/[: ]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ControversyChecker();
});