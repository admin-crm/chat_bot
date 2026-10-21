
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto("https://lepondykitchen.com/restaurant", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(5000);

    const accessibilityButton =
      page.locator('[aria-label="Enable accessibility"]');

    if (await accessibilityButton.count()) {
      await accessibilityButton.evaluate(element => element.click());
      await page.waitForTimeout(2000);
    }

    await page.getByRole("button", {
      name: /Native Grocers LLC Columbus,ohio/i
    }).click();

    await page.getByRole("button", {
      name: "Yes",
      exact: true
    }).click();

    await page.waitForTimeout(3000);

    await page.getByRole("button", {
      name: "Raw Millets",
      exact: true
    }).click();

    await page.waitForTimeout(3000);

    const products = await page.locator(
      'flt-semantics[role="group"][aria-label]'
    ).evaluateAll(elements =>
      elements.map(element => ({
        label: element.getAttribute("aria-label"),
        bounds: {
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height)
        }
      })).filter(item =>
        item.label &&
        /\$\d|\(\d+\)/.test(item.label)
      )
    );

    console.log("PRODUCT GROUP COUNT:", products.length);
    console.log("PRODUCT LABELS:");
    console.log(JSON.stringify(products, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
