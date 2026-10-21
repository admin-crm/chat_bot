
const { chromium } = require("playwright");

const WEBSITE = "https://lepondykitchen.com/restaurant";
const VENDOR_NAME = "Native Grocers LLC Columbus,ohio";

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    console.log("Opening LePondy Kitchen...");

    await page.goto(WEBSITE, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(8000);

    // Enable Flutter accessibility when the option is available.
    const accessibilityButton = page.locator(
      '[aria-label="Enable accessibility"]'
    );

    if (await accessibilityButton.count()) {
      console.log("Enabling accessibility...");

      await accessibilityButton.first().evaluate(
        element => element.click()
      );

      await page.waitForTimeout(3000);
    }

    // Find and select Native Grocers LLC.
    const vendorButton = page.getByRole("button", {
      name: VENDOR_NAME,
      exact: true
    });

    console.log(
      "Native Grocers vendor buttons found:",
      await vendorButton.count()
    );

    if (await vendorButton.count() === 0) {
      throw new Error(
        "Native Grocers vendor button was not found. " +
        "Check the page text and accessibility state."
      );
    }

    await vendorButton.first().click();
    await page.waitForTimeout(1500);

    // Confirm the vendor selection if a confirmation appears.
    const yesButton = page.getByRole("button", {
      name: "Yes",
      exact: true
    });

    if (await yesButton.count()) {
      console.log("Confirming vendor selection...");
      await yesButton.first().click();
      await page.waitForTimeout(4000);
    }

    // Print information after selecting the vendor.
    console.log("\n--- PAGE TITLE ---");
    console.log(await page.title());

    console.log("\n--- PAGE TEXT ---");
    console.log(
      (await page.locator("body").innerText()).slice(0, 10000)
    );

    console.log("\n--- BUTTON LABELS ---");

    const buttonLabels = await page
      .locator("flt-semantics[role='button']")
      .evaluateAll(elements =>
        elements
          .map(element =>
            element.getAttribute("aria-label") ||
            element.innerText
          )
          .filter(Boolean)
      );

    console.log(buttonLabels);

    console.log("\nBrowser is staying open for inspection.");

  } catch (error) {
    console.error("\nDiagnostic failed:", error.message);
  } finally {
    await browser.close();
  }
})();
