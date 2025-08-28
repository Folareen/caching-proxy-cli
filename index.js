#!/usr/bin/env node

const http = require('http');
const redis = require('redis');

(async () => {
    try {
        const args = process.argv;

        if ((args[2] === '--port' && args[4] === '--origin') || (args[2] === '--clear-site-cache') || (args[2] === '--clear-cache')) {

            console.log('Connecting to redis...');
            const redisClient = redis.createClient();
            redisClient.on("error", (err) => {
                throw err
            });
            await redisClient.connect();
            console.log('Successfully connected to redis!');

            if (args[2] === '--port' && args[4] === '--origin') {
                const port = args[3];
                const origin = args[5];

                http.createServer(async (req, res) => {
                    if (req.method !== 'GET') {
                        res.end();
                        return;
                    }

                    const cacheKey = `cp:${origin}`;
                    const cachedResponse = await redisClient.get(cacheKey);

                    if (cachedResponse) {
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'X-Cache': 'HIT'
                        });
                        res.end(cachedResponse);
                    } else {
                        const rawResponse = await fetch(origin);
                        let response = null;

                        const contentType = rawResponse.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            response = await rawResponse.json();
                        } else {
                            response = await rawResponse.text();
                        }

                        await redisClient.set(cacheKey, JSON.stringify(response));

                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'X-Cache': 'MISS'
                        });
                        res.end(JSON.stringify(response));
                    }
                }).listen(port, () => {
                    console.log(`Caching Proxy Server is running on port ${port}`);
                });

                return;
            }

            if (args[2] === '--clear-site-cache') {
                const server = args[3];
                const cacheKey = `cp:${server}`
                await redisClient.del(cacheKey)
                console.log(`Successfully cleared cache for ${server}`);
            }

            if (args[2] === '--clear-cache') {
                const keys = await redisClient.keys('cp:*')
                if (keys.length > 0) {
                    await redisClient.del(keys);
                    console.log('Cache cleared');
                }
            }

        }
        else {
            console.log('Supported commands are:')
            console.log('caching-proxy --port <number> --origin <url>')
            console.log('caching-proxy --clear-site-cache <url>')
            console.log('caching-proxy --clear-cache')
        }

        process.exit();
    } catch (error) {
        console.error('Error occurred', error);
        process.exit();
    }
}
)()
