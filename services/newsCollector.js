const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class NewsCollector {
    constructor() {
        this.rssUrl = 'https://news.google.com/rss/search';
        this.timeout = 10000;
        this.retryCount = 2;
    }

    async getNews(topic, maxResults = 5) {
        try {
            console.log(`Collecting additional news for: ${topic}`);
            const searchQuery = `${topic} (controversy OR scandal OR allegations OR investigation)`;
            const encodedQuery = encodeURIComponent(searchQuery);

            const response = await axios.get(this.rssUrl, {
                params: {
                    q: encodedQuery,
                    hl: 'en-US',
                    gl: 'US',
                    ceid: 'US:en'
                },
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            console.log(`Got RSS response for ${topic}, parsing...`);

            // Parse XML response
            const result = await parseStringPromise(response.data);
            const items = result.rss?.channel?.[0]?.item || [];

            const news = items.slice(0, maxResults).map(item => ({
                source: 'additionalNews',
                title: item.title[0],
                content: item.description ? item.description[0] : item.title[0],
                link: item.link[0],
                date: new Date(item.pubDate[0]).toISOString(),
                sourceDetail: item.source?.[0]?._?.trim() || 'News Source'
            }));

            console.log(`Found ${news.length} additional news items`);
            return news;
        } catch (error) {
            console.error('Error in additional news search:', error.message);

            if (this.retryCount > 0) {
                console.log('Retrying news search...');
                this.retryCount--;
                return this.getBackupNews(topic, maxResults);
            }

            return [];
        }
    }

    async getBackupNews(topic, maxResults = 5) {
        try {
            // Alternative news source - Use different approach
            const searchQuery = encodeURIComponent(`${topic} recent news controversy`);
            const url = `https://news.google.com/rss?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`;

            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15'
                }
            });

            // Parse XML response
            const result = await parseStringPromise(response.data);
            const items = result.rss?.channel?.[0]?.item || [];

            const news = items.slice(0, maxResults).map(item => ({
                source: 'additionalNews',
                title: item.title[0],
                content: item.description ? item.description[0] : item.title[0],
                link: item.link[0],
                date: new Date(item.pubDate[0]).toISOString(),
                sourceDetail: 'Google News'
            }));

            return news;
        } catch (error) {
            console.error('Error in backup news search:', error.message);
            return [];
        }
    }
}

module.exports = NewsCollector;