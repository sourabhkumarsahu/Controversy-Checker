const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core'); // Use puppeteer-core to reduce memory usage
const natural = require('natural');
const Sentiment = require('sentiment');
const fs = require('fs');

// Server Configuration
const config = {
    ports: [3001, 3002, 3003, 3004, 3005],
    currentDateTime: '2025-02-25 11:25:07',
    currentUser: 'SKSsearchtap'
};

const app = express();
const sentiment = new Sentiment();
const tokenizer = new natural.WordTokenizer();

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

        console.log('Score Calculation:', {
            articles: articles.length,
            averageScore,
            articleCountMultiplier,
            finalScore
        });

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
            return [];
        }
    }
};

// API endpoint
app.post('/api/check-controversy', async (req, res) => {
    const { name } = req.body;
    console.log(`Received search request for: ${name}`);

    if (!name || name.trim().length === 0) {
        return res.status(400).json({
            error: 'Name is required',
            timestamp: config.currentDateTime,
            user: config.currentUser
        });
    }

    const thirtyDaysAgo = utils.getDateXDaysAgo(30);

    try {
        console.log(`Starting news search for ${name}...`);
        const newsResults = await scraper.googleNews(name);
        console.log(`Found ${newsResults.length} total results`);

        const recentNews = newsResults.filter(item =>
            new Date(item.date) >= thirtyDaysAgo
        );
        console.log(`Found ${recentNews.length} recent results`);

        const controversyScore = utils.calculateOverallScore(recentNews);
        const hasControversy = controversyScore > 30;

        const avgSentiment = recentNews.reduce((sum, article) =>
            sum + article.sentiment.comparative, 0) / recentNews.length || 0;

        const controversyTypes = recentNews.reduce((acc, article) => {
            if (article.controversyType !== analysisCategories.CONTROVERSY_TYPES.NONE) {
                acc[article.controversyType] = (acc[article.controversyType] || 0) + 1;
            }
            return acc;
        }, {});

        const response = {
            name,
            timestamp: config.currentDateTime,
            user: config.currentUser,
            searchPeriod: { from: utils.formatDate(thirtyDaysAgo), to: utils.formatDate(new Date()) },
            hasControversy,
            controversyScore,
            controversyTypes,
            averageSentiment: avgSentiment,
            results: recentNews.sort((a, b) => {
                const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
                const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
                if (severityDiff !== 0) return severityDiff;
                return Math.abs(b.sentiment.comparative) - Math.abs(a.sentiment.comparative);
            }),
            analysisMetadata: {
                totalArticles: recentNews.length,
                severityCounts: recentNews.reduce((acc, article) => {
                    acc[article.severity] = (acc[article.severity] || 0) + 1;
                    return acc;
                }, {}),
                averageIntensity: recentNews.reduce((sum, article) => sum + article.intensityScore, 0) / recentNews.length || 0,
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

// Server startup function
async function startServer() {
    for (const port of config.ports) {
        try {
            await new Promise((resolve, reject) => {
                const server = app.listen(port, () => {
                    console.log(`Server running at http://localhost:${port}`);
                    console.log('Current Date and Time:', config.currentDateTime);
                    console.log('Current User:', config.currentUser);
                    resolve();
                });

                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log(`Port ${port} is in use, trying next port...`);
                        reject(error);
                    } else {
                        console.error('Server error:', error);
                        reject(error);
                    }
                });
            });
            return port;
        } catch (error) {
            if (port === config.ports[config.ports.length - 1]) {
                throw new Error('All ports are in use. Please free up a port or specify a different port range.');
            }
        }
    }
}

// Start the server
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
config.currentDateTime = '2025-02-25 11:29:15';
config.currentUser = 'SKSsearchtap';

module.exports = app;