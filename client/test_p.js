const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe', headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.toString()));
  await page.goto('http://localhost:5174');
  await new Promise(r => setTimeout(r, 2000));
  try {
    await page.type('input[placeholder="Email, username or phone"]', 'shameer');
    await page.type('input[placeholder="Password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  } catch (e) {
    console.log('Login not needed or failed');
  }
  await new Promise(r => setTimeout(r, 2000));
  try {
    const buttons = await page.$$('.icon-btn');
    for (let b of buttons) {
      let t = await page.evaluate(el => el.innerHTML, b);
      if (t.includes('path d="M20 11H7.83')) {
         await b.click();
         console.log('Clicked settings');
      }
    }
  } catch (e) {
    console.log(e);
  }
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
