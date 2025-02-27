const axios = require('axios');
const cheerio = require('cheerio');

class RedditScraper {
    constructor() {
        // Use old.reddit.com which has a more stable structure
        this.baseUrl = 'https://old.reddit.com';
        this.searchUrl = `${this.baseUrl}/search`;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36'
        ];
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async searchTopic(topic, limit = 5) {
        try {
            console.log(`Searching Reddit for: ${topic} (using old.reddit.com)`);

            const searchQuery = `${topic} (controversy OR scandal OR allegations OR investigation)`;

            const response = await axios.get(this.searchUrl, {
                params: {
                    q: searchQuery,
                    sort: 'relevance',
                    t: 'month',
                    include_over_18: 'on'  // Include all content
                },
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://old.reddit.com/'
                },
                timeout: 15000
            });

            console.log(`Got Reddit response for ${topic}, status: ${response.status}`);

            const $ = cheerio.load(response.data);
            const posts = [];

            // old.reddit.com search results format
            $('.search-result').slice(0, limit).each((i, element) => {
                try {
                    const $element = $(element);
                    const titleElem = $element.find('.search-title');
                    const title = titleElem.text().trim();
                    const link = titleElem.attr('href');
                    const fullUrl = link && (link.startsWith('/') ? `${this.baseUrl}${link}` : link);

                    const subreddit = $element.find('.search-subreddit-link').text().trim();
                    const timestamp = $element.find('time').attr('datetime') || '';

                    if (title && fullUrl) {
                        posts.push({
                            source: 'reddit',
                            title: title,
                            content: title, // Use title as content for sentiment analysis
                            link: fullUrl,
                            date: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
                            sourceDetail: subreddit
                        });
                    }
                } catch (e) {
                    console.error('Error parsing Reddit post:', e);
                }
            });

            console.log(`Found ${posts.length} Reddit posts for ${topic}`);

            if (posts.length === 0) {
                console.log('Trying alternate Reddit scraping approach...');
                return this.alternativeSearch(topic, limit);
            }

            return posts;
        } catch (error) {
            console.error('Error scraping Reddit:', error.message);
            return this.alternativeSearch(topic, limit);
        }
    }

    async alternativeSearch(topic, limit = 5) {
        try {
            // Try using Reddit's JSON API which is more stable
            console.log(`Trying Reddit JSON API for: ${topic}`);
            const encodedQuery = encodeURIComponent(`${topic} (controversy OR scandal OR allegations)`);
            const jsonUrl = `https://www.reddit.com/search.json?q=${encodedQuery}&sort=relevance&t=month&limit=${limit}`;

            const response = await axios.get(jsonUrl, {
                headers: {
                    'User-Agent': this.getRandomUserAgent()
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.children) {
                const posts = response.data.data.children
                    .filter(child => child.data && child.data.title)
                    .map(child => {
                        const data = child.data;
                        return {
                            source: 'reddit',
                            title: data.title,
                            content: data.title + (data.selftext ? ' ' + data.selftext : ''),
                            link: `https://www.reddit.com${data.permalink}`,
                            date: new Date(data.created_utc * 1000).toISOString(),
                            sourceDetail: data.subreddit_name_prefixed
                        };
                    });

                console.log(`Found ${posts.length} Reddit posts using JSON API`);
                return posts;
            }
            return [];
        } catch (error) {
            console.error('Error in alternative Reddit search:', error.message);
            return [];
        }
    }
}

module.exports = RedditScraper;