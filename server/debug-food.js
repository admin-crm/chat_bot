
const { chromium } = require("playwright");

const WEBSITE = "https://lepondykitchen.com/restaurant";

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.goto(WEBSITE, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    const accessibilityButton = page.locator(
      '[aria-label="Enable accessibility"]'
    );

    if (await accessibilityButton.count()) {
      await accessibilityButton.first().evaluate(
        element => element.click()
      );
      await page.waitForTimeout(2000);
    }

    const vendorButton = page.getByRole("button", {
      name: /^Food\b/i
    });

    console.log("Food buttons:", await vendorButton.count());
    await vendorButton.first().click();
    await page.waitForTimeout(3000);

    const yesButton = page.getByRole("button", {
      name: "Yes",
      exact: true
    });

    if (await yesButton.count()) {
      await yesButton.first().click();
      await page.waitForTimeout(2000);
    }

    const categoryButton = page.getByRole("button", {
      name: "Biriyani",
      exact: true
    });

    console.log("Snacks buttons:", await categoryButton.count());
    await categoryButton.first().click();
    await page.waitForTimeout(3000);

    const labels = await page.locator(
      "flt-semantics[aria-label]"
    ).evaluateAll(elements =>
      elements
        .map(element => element.getAttribute("aria-label"))
        .filter(Boolean)
    );

    console.log("\nAccessibility labels found:", labels.length);
    console.log(labels.join("\n---\n"));
    console.log("\nVisible page text:");
console.log(
  (await page.locator("body").innerText()).slice(0, 12000)
);

  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("Debug failed:", error.message);
  process.exit(1);
});
