const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  
  // Wait for React to mount
  await page.waitForTimeout(2000);
  
  // Try to login? No, we don't have credentials easily available here.
  // We can just evaluate a script to check if the DOM is there.
  console.log("Page loaded");
  await browser.close();
})();
