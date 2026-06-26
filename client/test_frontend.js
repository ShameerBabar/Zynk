const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  
  await page.goto('https://zynk-chat-shameer-2026.web.app', { waitUntil: 'networkidle2' });
  
  console.log("Page loaded successfully.");
  await browser.close();
})();
