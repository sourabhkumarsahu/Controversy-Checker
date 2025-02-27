class ControversyChecker {
    constructor() {
        // Configuration
        this.config = {
            currentDateTime: '2025-02-27 11:35:43',
            currentUser: 'SKSsearchtap',
            apiPort: 3001
        };

        // DOM Elements
        this.searchInput = document.getElementById('searchInput');
        this.searchButton = document.getElementById('searchButton');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.resultContainer = document.getElementById('resultContainer');
        this.statusMessage = document.getElementById('statusMessage');
        this.newsContainer = document.getElementById('newsContainer');
        this.footer = document.querySelector('footer');

        // Initialize source selectors
        this.sourceSelectors = [];

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

            // Add source selection options
            this.addSourceSelection();
        } catch (error) {
            console.warn('Could not load config.json, using default port:', error);
            this.createHeader(); // Still create header even if config fails
            this.addSourceSelection();
        }
    }

    createHeader() {
        // Create header container if it doesn't exist
        let headerContainer = document.querySelector('.header-container');
        if (!headerContainer) {
            headerContainer = document.createElement('div');
            headerContainer.className = 'header-container bg-gray-100 p-4 mb-6 rounded-lg text-center';

            // Create header content
            headerContainer.innerHTML = `
                <div class="flex justify-center items-center">
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

    addSourceSelection() {
        const sourceSelectionContainer = document.createElement('div');
        sourceSelectionContainer.className = 'my-4 p-4 bg-white rounded-lg shadow';
        sourceSelectionContainer.innerHTML = `
            <h3 class="text-lg font-medium text-gray-800 mb-2">Select data sources:</h3>
            <div class="flex justify-center space-x-6">
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" class="source-checkbox form-checkbox h-5 w-5 text-blue-500" value="news" checked>
                    <span class="text-lg">📰 News</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" class="source-checkbox form-checkbox h-5 w-5 text-blue-500" value="reddit" checked>
                    <span class="text-lg">🔶 Reddit</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" class="source-checkbox form-checkbox h-5 w-5 text-blue-500" value="twitter" checked>
                    <span class="text-lg">🐦 Twitter</span>
                </label>
            </div>
        `;

        // Insert after search input
        this.searchInput.parentNode.insertBefore(sourceSelectionContainer, this.searchInput.nextSibling);

        // Store source checkboxes
        this.sourceSelectors = document.querySelectorAll('.source-checkbox');
    }

    bindEvents() {
        this.searchButton.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Add event listener to ensure at least one source is selected
        this.sourceSelectors.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const anyChecked = Array.from(this.sourceSelectors).some(cb => cb.checked);
                if (!anyChecked) {
                    alert('At least one data source must be selected');
                    checkbox.checked = true;
                }
            });
        });
    }

    showLoading(show) {
        this.loadingIndicator.classList.toggle('hidden', !show);
        this.searchButton.disabled = show;
        if (show) {
            this.resultContainer.classList.add('hidden');
            this.displayLoadingQuotes();
        }
    }

    displayLoadingQuotes() {
        const quotes = [
            "Searching... We're not saying it's slow, but you might have time to make a sandwich.",
            "Hold on, we're checking the controversy. Meanwhile, enjoy this completely unrelated message!",
            "Loading... If it takes too long, blame the slow servers. We're broke!"
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        this.loadingIndicator.innerHTML = `
            <div class="flex items-center justify-center space-x-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="text-gray-600">${randomQuote}</span>
            </div>
        `;
    }

    async performSearch() {
        const searchTerm = this.searchInput.value.trim();
        if (!searchTerm) {
            this.showError('Please enter a name to search');
            return;
        }

        // Get selected sources
        const selectedSources = Array.from(this.sourceSelectors)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (selectedSources.length === 0) {
            this.showError('Please select at least one data source');
            return;
        }

        // Map the frontend "news" option to include both googleNews and additionalNews
        const apiSources = selectedSources.map(source => {
            if (source === 'news') {
                return ['googleNews', 'additionalNews'];
            }
            return source;
        }).flat();

        this.showLoading(true);

        try {
            // Send search event to Google Analytics
            if (typeof gtag === 'function') {
                gtag('event', 'search', {
                    'event_category': 'engagement',
                    'event_label': searchTerm,
                    'value': 1
                });
            }

            const response = await fetch(`/api/check-controversy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify({
                    name: searchTerm,
                    sources: apiSources,
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
            this.showError(`Error: ${error.message}. Please try again later.`);
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

        // Format source breakdown for summary
        let sourceBreakdownHtml = '';
        if (data.sourceBreakdown) {
            sourceBreakdownHtml = `
                <div class="mt-4 pt-4 border-t border-gray-200">
                    <h4 class="font-medium text-gray-700 mb-2">Results by Source:</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            `;

            // Combine Google News and Additional News counts
            const combinedSourceBreakdown = {...data.sourceBreakdown};
            let newsCount = 0;
            let newsAvgSentiment = 0;
            let newsTotalItems = 0;

            if (combinedSourceBreakdown.googleNews) {
                newsCount += combinedSourceBreakdown.googleNews.count;
                newsAvgSentiment += combinedSourceBreakdown.googleNews.averageSentiment * combinedSourceBreakdown.googleNews.count;
                newsTotalItems += combinedSourceBreakdown.googleNews.count;
                delete combinedSourceBreakdown.googleNews;
            }

            if (combinedSourceBreakdown.additionalNews) {
                newsCount += combinedSourceBreakdown.additionalNews.count;
                newsAvgSentiment += combinedSourceBreakdown.additionalNews.averageSentiment * combinedSourceBreakdown.additionalNews.count;
                newsTotalItems += combinedSourceBreakdown.additionalNews.count;
                delete combinedSourceBreakdown.additionalNews;
            }

            if (newsCount > 0) {
                combinedSourceBreakdown.news = {
                    count: newsCount,
                    averageSentiment: newsAvgSentiment / newsTotalItems
                };
            }

            // Create source cards
            for (const [source, stats] of Object.entries(combinedSourceBreakdown)) {
                const displayName = this.getDisplayNameForSource(source);
                const sentimentClass = stats.averageSentiment < 0 ? 'text-red-500' : 'text-green-500';
                const icon = this.getSourceIconForType(source);

                sourceBreakdownHtml += `
                    <div class="bg-gray-50 p-3 rounded">
                        <div class="font-semibold">${icon} ${displayName}</div>
                        <div>Items: ${stats.count}</div>
                        <div class="${sentimentClass}">Sentiment: ${(stats.averageSentiment * 100).toFixed(1)}%</div>
                    </div>
                `;
            }

            sourceBreakdownHtml += `</div></div>`;
        }

        summarySection.innerHTML = `
            <div class="text-center">
                <div class="text-2xl font-bold ${scoreColorClass} mb-4">
                    Controversy Score: ${controversyScore}%
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div class="bg-gray-50 p-3 rounded">
                        <div class="font-semibold">Analysis Period</div>
                        <div>${data.searchPeriod.from} to ${data.searchPeriod.to}</div>
                    </div>
                    <div class="bg-gray-50 p-3 rounded">
                        <div class="font-semibold">Total Items</div>
                        <div>${data.analysisMetadata.totalArticles} items analyzed</div>
                    </div>
                </div>
                ${sourceBreakdownHtml}
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
            // Create tabbed interface for sources
            const tabbedInterface = this.createTabbedInterface(data.results);
            this.newsContainer.appendChild(tabbedInterface);

            // Add export button if there are results
            this.addExportButton(data, searchTerm);
        } else {
            this.addNoResultsMessage('No news articles or posts found in the specified time period');
        }
    }

    createTabbedInterface(results) {
        const container = document.createElement('div');
        container.className = 'bg-white rounded-lg shadow overflow-hidden';

        // Group results by source type for tabs
        const groupedResults = this.groupResultsBySource(results);

        // Combine news sources
        const combinedGroupedResults = {...groupedResults};
        if (combinedGroupedResults.googleNews || combinedGroupedResults.additionalNews) {
            combinedGroupedResults.news = [
                ...(combinedGroupedResults.googleNews || []),
                ...(combinedGroupedResults.additionalNews || [])
            ];
            delete combinedGroupedResults.googleNews;
            delete combinedGroupedResults.additionalNews;
        }

        // Extract source types and prepare tabs
        const sourceTabs = Object.keys(combinedGroupedResults);

        if (sourceTabs.length === 0) {
            return container;
        }

        // Create tab navigation
        const tabsNav = document.createElement('div');
        tabsNav.className = 'flex border-b border-gray-200';

        // Create content container
        const tabContents = document.createElement('div');
        tabContents.className = 'p-4';

        sourceTabs.forEach((sourceType, index) => {
            const displayName = this.getDisplayNameForSource(sourceType);
            const icon = this.getSourceIconForType(sourceType);
            const count = combinedGroupedResults[sourceType].length;

            // Create tab button
            const tabButton = document.createElement('button');
            tabButton.className = `flex-1 py-3 px-4 text-center focus:outline-none ${
                index === 0 ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`;
            tabButton.dataset.tab = sourceType;
            tabButton.innerHTML = `
                <span class="font-medium">${icon} ${displayName}</span>
                <span class="ml-1 text-sm">(${count})</span>
            `;

            // Create tab content
            const tabContent = document.createElement('div');
            tabContent.className = `tab-content ${index === 0 ? '' : 'hidden'}`;
            tabContent.dataset.content = sourceType;

            // Add results to tab content
            const items = combinedGroupedResults[sourceType];
            const resultsList = document.createElement('div');
            resultsList.className = 'space-y-3';

            items.forEach((item, idx) => {
                const resultCard = this.createResultCard(item, idx + 1);
                resultsList.appendChild(resultCard);
            });

            tabContent.appendChild(resultsList);
            tabContents.appendChild(tabContent);

            // Add tab click event
            tabButton.addEventListener('click', () => {
                // Update tab button styles
                document.querySelectorAll('[data-tab]').forEach(btn => {
                    btn.classList.remove('bg-blue-500', 'text-white');
                    btn.classList.add('bg-gray-100', 'hover:bg-gray-200');
                });
                tabButton.classList.remove('bg-gray-100', 'hover:bg-gray-200');
                tabButton.classList.add('bg-blue-500', 'text-white');

                // Show/hide tab content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.add('hidden');
                });
                document.querySelector(`[data-content="${sourceType}"]`).classList.remove('hidden');
            });

            tabsNav.appendChild(tabButton);
        });

        container.appendChild(tabsNav);
        container.appendChild(tabContents);

        return container;
    }

    groupResultsBySource(results) {
        return results.reduce((acc, item) => {
            const sourceType = item.sourceType || 'unknown';
            if (!acc[sourceType]) acc[sourceType] = [];
            acc[sourceType].push(item);
            return acc;
        }, {});
    }

    getDisplayNameForSource(source) {
        const sourceNames = {
            'googleNews': 'News',
            'news': 'News',
            'additionalNews': 'News',
            'reddit': 'Reddit',
            'twitter': 'Twitter',
            'unknown': 'Other Sources'
        };

        return sourceNames[source] || source;
    }

    getSourceIconForType(sourceType) {
        const icons = {
            googleNews: '📰',
            news: '📰',
            additionalNews: '📰',
            reddit: '🔶',
            twitter: '🐦',
            unknown: '🔍'
        };

        return icons[sourceType] || '🔍';
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

        const sourceBadgeClass = this.getSourceBadgeClass(item.sourceType);
        const sourceDetail = item.sourceDetail || this.getDisplayNameForSource(item.sourceType);
        const sourceBadge = `
            <span class="px-2 py-0.5 text-xs rounded ${sourceBadgeClass}">
                ${sourceDetail}
            </span>
        `;

        card.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 w-7 h-7 ${
            severity !== 'NONE' ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500'
        } rounded-full flex items-center justify-center font-semibold text-sm">
                    ${index}
                </div>
                <div class="flex-grow">
                    <a href="${item.link}" target="_blank" class="block">
                        <h4 class="font-medium text-gray-900 hover:text-blue-600">${item.title}</h4>
                        <div class="flex flex-wrap items-center text-sm text-gray-500 mt-1 gap-2">
                            <span>${date}</span>
                            <span>•</span>
                            <span>Severity: ${severity}</span>
                            ${sourceBadge}
                        </div>
                        ${sentimentHtml}
                    </a>
                </div>
            </div>
        `;

        return card;
    }

    getSourceBadgeClass(sourceType) {
        // Map googleNews and additionalNews to same style as news
        if (sourceType === 'googleNews' || sourceType === 'additionalNews') {
            sourceType = 'news';
        }

        const badgeClasses = {
            news: 'bg-blue-100 text-blue-800',
            reddit: 'bg-orange-100 text-orange-800',
            twitter: 'bg-blue-100 text-blue-800'
        };

        return badgeClasses[sourceType] || 'bg-gray-100 text-gray-800';
    }

    addNoResultsMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'text-center text-gray-600 py-4 bg-white rounded-lg shadow p-6';
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
        // Remove any existing export button first
        const existingButton = document.querySelector('#exportButton');
        if (existingButton) {
            existingButton.remove();
        }

        const exportButton = document.createElement('button');
        exportButton.id = 'exportButton';
        exportButton.className = 'fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition duration-200 shadow-lg';
        exportButton.innerHTML = `<span class="mr-1">📥</span> Export Results`;
        exportButton.onclick = () => this.exportResults(data, searchTerm);
        document.body.appendChild(exportButton);
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
                controversyTypes: data.controversyTypes,
                sourceBreakdown: data.sourceBreakdown
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