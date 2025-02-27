const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const natural = require('natural');
const Sentiment = require('sentiment');
const fs = require('fs');
const xml2js = require('xml2js');

// Import the new scrapers
const RedditScraper = require('./services/redditScraper');
const NitterScraper = require('./services/nitterScraper');
const NewsCollector = require('./services/newsCollector');

// Server Configuration
const config = {
    ports: [3001],
    currentDateTime: '2025-02-27 10:38:30',
    currentUser: 'SKSsearchtap'
};

const app = express();
const sentiment = new Sentiment();
const tokenizer = new natural.WordTokenizer();

// Initialize the new scrapers
const redditScraper = new RedditScraper();
const nitterScraper = new NitterScraper();
const newsCollector = new NewsCollector();

// CORS Configuration
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

// Apply middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html on the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Analysis Categories
const analysisCategories = {
    // Your existing categories
    SEVERITY_LEVELS: {
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW',
        NONE: 'NONE'
    },
    CONTROVERSY_TYPES: {
        PERSONAL: 'Personal Conduct',
        PROFESSIONAL: 'Professional Misconduct',
        SOCIAL: 'Social Issues',
        POLITICAL: 'Political',
        LEGAL: 'Legal Issues',
        FINANCIAL: 'Financial',
        ETHICAL: 'Ethical',
        NONE: 'No Controversy'
    }
};

// Context patterns
const contextPatterns = {
    // Your existing patterns
    legal: {
        patterns: ['lawsuit', 'court', 'legal', 'judge', 'trial', 'charged', 'alleged', 'criminal', 'police'],
        weight: 2.0
    },
    ethical: {
        patterns: ['misconduct', 'ethics', 'violation', 'inappropriate', 'scandal', 'wrongdoing'],
        weight: 1.8
    },
    social: {
        patterns: ['controversy', 'backlash', 'criticism', 'protest', 'outrage', 'racist', 'discrimination'],
        weight: 1.5
    },
    financial: {
        patterns: ['fraud', 'corruption', 'bribe', 'embezzlement', 'financial misconduct', 'money laundering'],
        weight: 2.0
    },
    personal: {
        patterns: ['behavior', 'comments', 'statement', 'personal', 'private', 'affair', 'relationship'],
        weight: 1.2
    }
};

// Utility functions
const utils = {
    // Your existing utility functions
    getDateXDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date;
    },
    formatDate(date) {
        return date.toISOString().split('T')[0];
    },
    calculateOverallScore(articles) {
        if (!articles.length) return 0;

        const weights = {
            sentiment: 0.4,
            severity: 0.3,
            recency: 0.2,
            keywords: 0.1
        };

        const severityMultipliers = {
            HIGH: 1.0,
            MEDIUM: 0.7,
            LOW: 0.4,
            NONE: 0.1
        };

        const scores = articles.map(article => {
            const sentimentScore = Math.abs((article.sentiment.comparative + 5) * 10);
            const severityScore = severityMultipliers[article.severity] * 100;

            const articleDate = new Date(article.date);
            const now = new Date();
            const daysDiff = (now - articleDate) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.max(0, 100 - (daysDiff * 3.33));

            const keywordScore = article.matchedKeywords ?
                Math.min(100, article.matchedKeywords.length * 20) : 0;

            return (
                (sentimentScore * weights.sentiment) +
                (severityScore * weights.severity) +
                (recencyScore * weights.recency) +
                (keywordScore * weights.keywords)
            );
        });

        const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const articleCountMultiplier = Math.min(1, articles.length / 5);
        const finalScore = Math.round(averageScore * articleCountMultiplier);

        return Math.min(100, finalScore);
    },
    analyzeContent(text) {
        const sentimentResult = sentiment.analyze(text);
        sentimentResult.comparative = Math.max(-5, Math.min(5, sentimentResult.comparative * 2));

        const tokens = tokenizer.tokenize(text.toLowerCase());
        const contextScores = this.analyzeContext(tokens, text);
        const intensityScore = this.calculateIntensity(text, sentimentResult);

        const { controversyType, severity } = this.determineControversyTypeAndSeverity(
            contextScores,
            sentimentResult,
            intensityScore
        );

        return {
            sentiment: sentimentResult,
            contextScores,
            controversyType,
            severity,
            intensityScore,
            isControversial: severity !== 'NONE',
            matchedKeywords: this.findMatchedKeywords(text)
        };
    },
    analyzeContext(tokens, fullText) {
        const scores = {};

        for (const [category, data] of Object.entries(contextPatterns)) {
            let score = 0;

            data.patterns.forEach(pattern => {
                const regex = new RegExp(pattern, 'gi');
                const matches = (fullText.match(regex) || []).length;
                score += matches * data.weight;
            });

            if (score > 0) {
                score = this.analyzeSurroundingContext(tokens, data.patterns) * data.weight;
            }

            scores[category] = score;
        }

        return scores;
    },
    analyzeSurroundingContext(tokens, patterns) {
        let contextScore = 0;
        const windowSize = 5;

        tokens.forEach((token, index) => {
            if (patterns.some(pattern => token.includes(pattern))) {
                const start = Math.max(0, index - windowSize);
                const end = Math.min(tokens.length, index + windowSize);
                const surroundingWords = tokens.slice(start, end);

                const intensifierScore = this.checkIntensifiers(surroundingWords);
                const modifierScore = this.checkModifiers(surroundingWords);

                contextScore += 1 + intensifierScore + modifierScore;
            }
        });

        return contextScore;
    },
    calculateIntensity(text, sentimentResult) {
        const intensifiers = [
            'very', 'extremely', 'severely', 'highly', 'completely',
            'major', 'serious', 'critical', 'massive', 'huge',
            'breaking', 'urgent', 'exclusive', 'shocking'
        ];

        const intensityCount = intensifiers.reduce((count, word) => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            return count + (text.match(regex) || []).length;
        }, 0);

        const sentimentIntensity = Math.abs(sentimentResult.comparative);
        return Math.min(5, sentimentIntensity + (intensityCount * 0.5));
    },
    checkIntensifiers(words) {
        const intensifiers = ['very', 'extremely', 'severely', 'highly', 'completely'];
        return words.filter(word => intensifiers.includes(word)).length * 0.5;
    },
    checkModifiers(words) {
        const negators = ['not', 'never', 'no', 'none', 'neither'];
        return words.filter(word => negators.includes(word)).length * -0.7;
    },
    findMatchedKeywords(text) {
        const controversyTerms = [
            'scandal', 'controversy', 'allegation', 'investigation',
            'accused', 'protest', 'criticism', 'backlash', 'outrage',
            'lawsuit', 'legal action', 'violation', 'misconduct'
        ];

        return controversyTerms.filter(term =>
            new RegExp(`\\b${term}\\b`, 'i').test(text)
        );
    },
    determineControversyTypeAndSeverity(contextScores, sentimentResult, intensityScore) {
        const maxContext = Object.entries(contextScores)
            .reduce((max, [category, score]) =>
                    score > max.score ? { category, score } : max,
                { category: 'none', score: 0 }
            );

        const severityScore = (
            Math.abs(sentimentResult.comparative) * 0.4 +
            maxContext.score * 0.3 +
            intensityScore * 0.3
        );

        let severity;
        if (severityScore > 3.5) severity = 'HIGH';
        else if (severityScore > 2) severity = 'MEDIUM';
        else if (severityScore > 1) severity = 'LOW';
        else severity = 'NONE';

        const controversyType = this.mapContextToControversyType(maxContext.category, severityScore);

        return { controversyType, severity };
    },
    mapContextToControversyType(context, score) {
        if (score < 1) return analysisCategories.CONTROVERSY_TYPES.NONE;

        const mappings = {
            legal: analysisCategories.CONTROVERSY_TYPES.LEGAL,
            ethical: analysisCategories.CONTROVERSY_TYPES.ETHICAL,
            social: analysisCategories.CONTROVERSY_TYPES.SOCIAL,
            financial: analysisCategories.CONTROVERSY_TYPES.FINANCIAL,
            personal: analysisCategories.CONTROVERSY_TYPES.PERSONAL
        };

        return mappings[context] || analysisCategories.CONTROVERSY_TYPES.NONE;
    }
};

// Scraping function
const scraper = {
    // Your existing Google News scraper
    async googleNews(searchTerm) {
        try {
            const browser = await puppeteer.launch({
                executablePath: process.env.CHROME_BIN || null,
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
                timeout: 30000
            });

            console.log(`Starting scrape for: ${searchTerm}`);
            const page = await browser.newPage();

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1280, height: 800 });

            const searchQuery = `${searchTerm} (controversy OR scandal OR allegations OR investigation)`;
            const encodedQuery = encodeURIComponent(searchQuery);
            const url = `https://news.google.com/search?q=${encodedQuery}&hl=en-US`;

            console.log(`Navigating to: ${url}`);

            await page.goto(url, {
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 30000
            });

            await page.waitForSelector('article', {
                timeout: 10000
            }).catch(e => console.log('Timeout waiting for articles, continuing anyway...'));

            await page.waitForTimeout(2000);

            console.log('Starting article extraction...');

            const articles = await page.evaluate(() => {
                const items = [];
                const articleElements = document.querySelectorAll('article');
                console.log(`Found ${articleElements.length} articles`);

                articleElements.forEach((article, index) => {
                    try {
                        const titleElement = article.querySelector('h3');
                        const linkElement = article.querySelector('a');
                        const timeElement = article.querySelector('time');
                        const sourceElement = article.querySelector('div[data-n-tid]');

                        if (titleElement && linkElement) {
                            items.push({
                                title: titleElement.textContent.trim(),
                                link: linkElement.href,
                                date: timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString(),
                                source: sourceElement ? sourceElement.textContent.trim() : 'Google News',
                                index: index
                            });
                        }
                    } catch (err) {
                        console.log(`Error processing article ${index}:`, err);
                    }
                });

                return items;
            });

            console.log(`Extracted ${articles.length} articles`);
            await browser.close();

            if (articles.length === 0) {
                console.log('No articles found, trying alternative search...');
                const alternativeArticles = await this.alternativeSearch(searchTerm);
                if (alternativeArticles.length > 0) {
                    return alternativeArticles;
                }
            }

            return articles.map(article => {
                const analysis = utils.analyzeContent(article.title);
                return { ...article, ...analysis, processedAt: new Date().toISOString() };
            });

        } catch (error) {
            console.error('Error in Google News scraping:', error);
            return this.alternativeSearch(searchTerm);
        }
    },
    async alternativeSearch(searchTerm) {
        try {
            const encodedQuery = encodeURIComponent(`${searchTerm} controversy news`);
            const response = await axios.get(`https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });

            const $ = cheerio.load(response.data, { xmlMode: true });
            const items = [];

            $('item').each((i, item) => {
                const title = $(item).find('title').text();
                const link = $(item).find('link').text();
                const pubDate = $(item).find('pubDate').text();

                items.push({ title, link, date: new Date(pubDate).toISOString(), source: 'Google News (RSS)', index: i });
            });

            return items.map(article => {
                const analysis = utils.analyzeContent(article.title);
                return { ...article, ...analysis, processedAt: new Date().toISOString() };
            });

        } catch (error) {
            console.error('Error in alternative search:', error);
            return [];
        }
    },

    // Method to gather data from all sources with improved error handling
    async gatherFromAllSources(searchTerm, sources = ['googleNews', 'news', 'reddit', 'twitter']) {
        console.log(`Gathering data from sources: ${sources.join(', ')} for term: ${searchTerm}`);

        // Ensure correct source handling
        // If 'news' is specified, include both Google News and additional news
        const expandedSources = [...sources];
        if (sources.includes('news') && !sources.includes('googleNews')) {
            expandedSources.push('googleNews');
        }
        if (sources.includes('news') && !sources.includes('additionalNews')) {
            expandedSources.push('additionalNews');
        }

        console.log(`Expanded sources: ${expandedSources.join(', ')}`);

        const allResults = [];
        const promises = [];
        const sourcesAvailability = {};

        if (expandedSources.includes('googleNews')) {
            promises.push(
                this.googleNews(searchTerm)
                    .then(items => {
                        console.log(`Got ${items.length} Google News items`);
                        items.forEach(item => {
                            item.sourceType = 'googleNews';
                            item.sourceDetail = item.source || 'Google News';
                        });
                        allResults.push(...items);
                        sourcesAvailability.googleNews = items.length;
                    })
                    .catch(err => {
                        console.error('Error fetching from Google News:', err.message);
                        sourcesAvailability.googleNews = 0;
                    })
            );
        }

        if (expandedSources.includes('additionalNews') || expandedSources.includes('news')) {
            promises.push(
                newsCollector.getNews(searchTerm)
                    .then(items => {
                        const analyzedItems = items.map(item => {
                            const analysis = utils.analyzeContent(item.title);
                            return {
                                ...item,
                                ...analysis,
                                sourceType: 'additionalNews',
                                processedAt: new Date().toISOString()
                            };
                        });
                        console.log(`Got ${analyzedItems.length} additional news items`);
                        allResults.push(...analyzedItems);
                        sourcesAvailability.additionalNews = analyzedItems.length;
                    })
                    .catch(err => {
                        console.error('Error fetching from additional news:', err.message);
                        sourcesAvailability.additionalNews = 0;
                    })
            );
        }

        if (expandedSources.includes('reddit')) {
            promises.push(
                redditScraper.searchTopic(searchTerm)
                    .then(items => {
                        const analyzedItems = items.map(item => {
                            const analysis = utils.analyzeContent(item.title);
                            return {
                                ...item,
                                ...analysis,
                                sourceType: 'reddit',
                                processedAt: new Date().toISOString()
                            };
                        });
                        console.log(`Got ${analyzedItems.length} Reddit items`);
                        allResults.push(...analyzedItems);
                        sourcesAvailability.reddit = analyzedItems.length;
                    })
                    .catch(err => {
                        console.error('Error fetching from Reddit:', err.message);
                        sourcesAvailability.reddit = 0;
                    })
            );
        }

        if (expandedSources.includes('twitter')) {
            promises.push(
                nitterScraper.searchTopic(searchTerm)
                    .then(items => {
                        const analyzedItems = items.map(item => {
                            const analysis = utils.analyzeContent(item.content || item.title);
                            return {
                                ...item,
                                ...analysis,
                                sourceType: 'twitter',
                                processedAt: new Date().toISOString()
                            };
                        });
                        console.log(`Got ${analyzedItems.length} Twitter items`);
                        allResults.push(...analyzedItems);
                        sourcesAvailability.twitter = analyzedItems.length;
                    })
                    .catch(err => {
                        console.error('Error fetching from Twitter:', err.message);
                        sourcesAvailability.twitter = 0;
                    })
            );
        }

        // Wait for all data gathering to complete, even if some fail
        await Promise.allSettled(promises);
        console.log(`Total items gathered from all sources: ${allResults.length}`);
        console.log('Sources availability:', sourcesAvailability);

        // Update config timestamps
        config.currentDateTime = '2025-02-27 11:41:09';
        config.currentUser = 'SKSsearchtap';

        // Apply additional processing or filtering if needed
        const processedResults = allResults.map(item => {
            // Ensure all items have necessary fields
            return {
                ...item,
                date: item.date || new Date().toISOString(),
                severity: item.severity || 'NONE',
                title: item.title || 'Untitled Content',
                link: item.link || '#',
                content: item.content || item.title || '',
                sourceType: item.sourceType || 'unknown'
            };
        });

        // Sort by date (most recent first)
        processedResults.sort((a, b) => new Date(b.date) - new Date(a.date));

        return processedResults;
    }
};

// Updated API endpoint to support multiple sources
app.post('/api/check-controversy', async (req, res) => {
    const { name, sources } = req.body;
    console.log(`Received search request for: ${name}`);

    if (!name || name.trim().length === 0) {
        return res.status(400).json({
            error: 'Name is required',
            timestamp: config.currentDateTime,
            user: config.currentUser
        });
    }

    // Use provided sources or default to all
    const sourcesToCheck = sources || ['googleNews', 'news', 'reddit', 'twitter'];
    const thirtyDaysAgo = utils.getDateXDaysAgo(30);

    try {
        console.log(`Starting multi-source search for ${name}...`);
        const allResults = await scraper.gatherFromAllSources(name, sourcesToCheck);
        console.log(`Found ${allResults.length} total results across all sources`);

        const recentResults = allResults.filter(item =>
            new Date(item.date) >= thirtyDaysAgo
        );
        console.log(`Found ${recentResults.length} recent results`);

        const controversyScore = utils.calculateOverallScore(recentResults);
        const hasControversy = controversyScore > 30;

        const avgSentiment = recentResults.length > 0 ?
            recentResults.reduce((sum, article) => sum + article.sentiment.comparative, 0) / recentResults.length : 0;

        const controversyTypes = recentResults.reduce((acc, article) => {
            if (article.controversyType !== analysisCategories.CONTROVERSY_TYPES.NONE) {
                acc[article.controversyType] = (acc[article.controversyType] || 0) + 1;
            }
            return acc;
        }, {});

        // Group results by source for analytics
        const resultsBySource = recentResults.reduce((acc, item) => {
            const sourceType = item.sourceType || 'unknown';
            if (!acc[sourceType]) acc[sourceType] = [];
            acc[sourceType].push(item);
            return acc;
        }, {});

        const sourceStats = {};
        for (const [source, items] of Object.entries(resultsBySource)) {
            sourceStats[source] = {
                count: items.length,
                averageSentiment: items.reduce((sum, item) => sum + item.sentiment.comparative, 0) / items.length,
                severityCounts: items.reduce((acc, item) => {
                    acc[item.severity] = (acc[item.severity] || 0) + 1;
                    return acc;
                }, {})
            };
        }

        const response = {
            name,
            timestamp: config.currentDateTime,
            user: config.currentUser,
            searchPeriod: { from: utils.formatDate(thirtyDaysAgo), to: utils.formatDate(new Date()) },
            hasControversy,
            controversyScore,
            controversyTypes,
            averageSentiment: avgSentiment,
            sourceBreakdown: sourceStats,
            results: recentResults.sort((a, b) => {
                const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
                const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
                if (severityDiff !== 0) return severityDiff;
                return Math.abs(b.sentiment.comparative) - Math.abs(a.sentiment.comparative);
            }),
            analysisMetadata: {
                totalArticles: recentResults.length,
                sourcesChecked: sourcesToCheck,
                severityCounts: recentResults.reduce((acc, article) => {
                    acc[article.severity] = (acc[article.severity] || 0) + 1;
                    return acc;
                }, {}),
                averageIntensity: recentResults.reduce((sum, article) => sum + article.intensityScore, 0) / recentResults.length || 0,
                searchTimestamp: new Date().toISOString()
            }
        };

        console.log(`Sending response with ${response.results.length} articles`);
        console.log('Controversy Score:', controversyScore);
        console.log('Average Sentiment:', avgSentiment);

        res.json(response);

    } catch (error) {
        console.error('Error in controversy check:', error);
        res.status(500).json({
            error: 'Failed to fetch results',
            details: error.message,
            timestamp: config.currentDateTime,
            user: config.currentUser
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: config.currentDateTime,
        user: config.currentUser
    });
});

// New endpoint for advanced controversy checking with source selection
app.post('/api/check-controversy/advanced', async (req, res) => {
    const { name, sources } = req.body;
    console.log(`Received advanced search request for: ${name} with sources: ${sources}`);

    if (!name || name.trim().length === 0) {
        return res.status(400).json({
            error: 'Name is required',
            timestamp: config.currentDateTime,
            user: config.currentUser
        });
    }

    try {
        // Default to all sources if none specified
        const sourcesToCheck = Array.isArray(sources) && sources.length > 0 ?
            sources : ['googleNews', 'news', 'reddit', 'twitter'];

        const allResults = await scraper.gatherFromAllSources(name, sourcesToCheck);

        // Use the same processing logic as the main endpoint
        const thirtyDaysAgo = utils.getDateXDaysAgo(30);

        const recentResults = allResults.filter(item =>
            new Date(item.date) >= thirtyDaysAgo
        );

        const controversyScore = utils.calculateOverallScore(recentResults);
        const hasControversy = controversyScore > 30;

        res.json({
            name,
            timestamp: config.currentDateTime,
            user: config.currentUser,
            sourcesChecked: sourcesToCheck,
            hasControversy,
            controversyScore,
            totalResults: recentResults.length,
            results: recentResults.sort((a, b) => {
                const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
                return severityOrder[b.severity] - severityOrder[a.severity];
            })
        });
    } catch (error) {
        console.error('Error in advanced controversy check:', error);
        res.status(500).json({
            error: 'Failed to fetch results',
            details: error.message,
            timestamp: config.currentDateTime,
            user: config.currentUser
        });
    }
});

// Server startup function
async function startServer() {
    const ports = process.env.PORT ? [process.env.PORT] : config.ports;
    for (const configuredPort of ports) {
        try {
            await new Promise((resolve, reject) => {
                const server = app.listen(configuredPort, () => {
                    console.log(`Server running at http://localhost:${configuredPort}`);
                    console.log('Current Date and Time:', config.currentDateTime);
                    console.log('Current User:', config.currentUser);
                    resolve();
                });

                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log(`Port ${configuredPort} is in use, trying next port...`);
                        reject(error);
                    } else {
                        console.error('Server error:', error);
                        reject(error);
                    }
                });
            });
            return configuredPort;
        } catch (error) {
            if (configuredPort === ports[ports.length - 1]) {
                throw new Error('All ports are in use. Please free up a port or specify a different port range.');
            }
        }
    }
}

// Start the server
startServer()
    .then(activePort => {
        console.log(`Server successfully started on port ${activePort}`);
        const configFile = {
            apiPort: activePort,
            startTime: config.currentDateTime,
            user: config.currentUser
        };
        fs.writeFileSync('config.json', JSON.stringify(configFile, null, 2));
    })
    .catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Update configuration
config.currentDateTime = '2025-02-27 10:51:58';
config.currentUser = 'SKSsearchtap';

module.exports = app;