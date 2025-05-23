import { Route } from '@/types';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer';

export const route: Route = {
    path: '/news/:options?',
    categories: ['game'],
    example: '/fortnite/news',
    parameters: { options: 'Params' },
    features: {
        requireConfig: false,
        requirePuppeteer: true,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'News',
    maintainers: ['lyqluis'],
    handler,
    description: `-   \`options.lang\`, optional, language, eg. \`/fortnite/news/lang=en-US\`, common languages are listed below, more languages are available one the [official website](https://www.fortnite.com/news)

| English (default) | Spanish | Japanese | French | Korean | Polish |
| ----------------- | ------- | -------- | ------ | ------ | ------ |
| en-US             | es-ES   | ja       | fr     | ko     | pl     |`,
};

async function handler(ctx) {
    const options = ctx.req
        .param('options')
        ?.split('&')
        .map((op) => op.split('='));

    const rootUrl = 'https://www.fortnite.com';
    const path = 'news';
    const language = options?.find((op) => op[0] === 'lang')[1] ?? 'en-US';
    const link = `${rootUrl}/${path}?lang=${language}`;
    const apiUrl = `https://www.fortnite.com/api/blog/getPosts?category=&postsPerPage=0&offset=0&locale=${language}&rootPageSlug=blog`;

    // using puppeteer instead instead of got
    // whitch may be blocked by anti-crawling script with response code 403
    const browser = await puppeteer();
    const page = await browser.newPage();

    // intercept all requests
    await page.setRequestInterception(true);
    // only document is allowed
    page.on('request', (request) => {
        request.resourceType() === 'document' ? request.continue() : request.abort();
    });

    // get json data in response event handler
    let data;
    page.on('response', async (res) => {
        data = await res.json();
    });

    // log manually (necessary for puppeteer)
    logger.http(`Requesting ${apiUrl}`);
    await page.goto(apiUrl, {
        waitUntil: 'networkidle0', // if use 'domcontentloaded', `await page.content()` is necessary
    });

    await page.close();
    await browser.close();

    const { blogList: list } = data;
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, () => ({
                title: item.title,
                link: `${rootUrl}/${path}/${item.slug}?lang=${language}`,
                pubDate: parseDate(item.date),
                author: item.author,
                description: item.content, // includes <img /> & full text
            }))
        )
    );

    return {
        title: 'Fortnite News',
        link,
        item: items,
    };
}
