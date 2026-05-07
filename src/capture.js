const puppeteer = require('puppeteer');

const DEFAULT_OPTIONS = {
  width: 1280,
  height: 800,
  delay: 300,
  lazyLoadWait: 500,
  format: 'png',
  quality: undefined,
  hideStickyElements: true,
};

async function capture(url, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Clamp viewport to valid ranges
  opts.width = Math.max(320, Math.min(3840, opts.width));
  opts.height = Math.max(200, Math.min(2160, opts.height));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    await autoScroll(page, opts);

    if (opts.hideStickyElements) {
      await hideStickyElements(page);
    }

    const buffer = await page.screenshot({
      fullPage: true,
      type: opts.format,
      quality: opts.format === 'jpeg' ? (opts.quality || 90) : undefined,
    });

    if (opts.hideStickyElements) {
      await restoreStickyElements(page);
    }

    const title = await page.title();

    return { buffer, title, url };
  } finally {
    await browser.close();
  }
}

async function captureLinks(url, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const links = await detectNavLinks(page);

    if (links.length === 0) {
      const buffer = await singleCapture(page, opts);
      const title = await page.title();
      return {
        links: [],
        results: [{ buffer, title, url }],
      };
    }

    const results = [];

    if (opts.onProgress) {
      opts.onProgress({ page: 0, total: links.length + 1, text: 'Current page' });
    }

    const mainBuffer = await singleCapture(page, opts);
    const mainTitle = await page.title();
    results.push({ buffer: mainBuffer, title: mainTitle, url });

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      if (opts.onProgress) {
        opts.onProgress({ page: i + 1, total: links.length + 1, text: link.text });
      }

      try {
        await page.goto(link.href, { waitUntil: 'networkidle2', timeout: 30000 });
        const buffer = await singleCapture(page, opts);
        const title = await page.title();
        results.push({ buffer, title, url: link.href, linkText: link.text });
      } catch (err) {
        results.push({ error: err.message, url: link.href, linkText: link.text });
      }
    }

    return { links, results };
  } finally {
    await browser.close();
  }
}

async function singleCapture(page, opts) {
  await autoScroll(page, opts);

  if (opts.hideStickyElements) {
    await hideStickyElements(page);
  }

  const buffer = await page.screenshot({
    fullPage: true,
    type: opts.format,
    quality: opts.format === 'jpeg' ? (opts.quality || 90) : undefined,
  });

  if (opts.hideStickyElements) {
    await restoreStickyElements(page);
  }

  return buffer;
}

async function autoScroll(page, opts) {
  await page.evaluate(async (delay, lazyWait) => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const viewportHeight = window.innerHeight;
      const step = Math.floor(viewportHeight * 0.8);

      const timer = setInterval(() => {
        window.scrollBy(0, step);
        totalHeight += step;
        const maxHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        if (totalHeight >= maxHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, delay);
        }
      }, delay);
    });
  }, opts.delay, opts.lazyLoadWait);
}

async function hideStickyElements(page) {
  await page.evaluate(() => {
    const hidden = [];
    document.querySelectorAll('*').forEach((el) => {
      const style = window.getComputedStyle(el);
      if (
        (style.position === 'fixed' || style.position === 'sticky') &&
        el.getBoundingClientRect().height > 0 &&
        el.getBoundingClientRect().width > 100
      ) {
        hidden.push({ el, orig: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    });
    window.__pagesnap_hidden = hidden;
  });
}

async function restoreStickyElements(page) {
  await page.evaluate(() => {
    if (window.__pagesnap_hidden) {
      window.__pagesnap_hidden.forEach((h) => {
        h.el.style.visibility = h.orig;
      });
      window.__pagesnap_hidden = null;
    }
  });
}

async function detectNavLinks(page) {
  return page.evaluate(() => {
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname;
    const seen = new Set();
    const links = [];

    const navContainers = document.querySelectorAll('nav, header');
    let anchors = [];
    navContainers.forEach((container) => {
      anchors.push(...container.querySelectorAll('a[href]'));
    });

    if (anchors.length === 0) {
      anchors = [...document.querySelectorAll('a[href]')].slice(0, 50);
    }

    for (const a of anchors) {
      try {
        const url = new URL(a.href, window.location.href);

        if (url.origin !== currentOrigin) continue;
        if (url.pathname === currentPath && url.hash) continue;
        if (url.protocol === 'javascript:') continue;
        if (url.pathname === currentPath && !url.hash) continue;

        const key = url.pathname + url.search;
        if (seen.has(key)) continue;
        seen.add(key);

        const text = (a.textContent || '').trim().substring(0, 50);
        if (!text) continue;

        const lowerText = text.toLowerCase();
        if (
          ['login', 'logout', 'sign in', 'sign out', 'search', 'cart'].some(
            (k) => lowerText.includes(k)
          )
        )
          continue;

        links.push({ text, href: url.href, pathname: url.pathname });
      } catch {
        continue;
      }
    }
    return links;
  });
}

module.exports = { capture, captureLinks };
