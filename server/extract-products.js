
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CATEGORY = process.argv[2] || "Snacks";
const VENDOR = process.argv[3] || "Native Grocers LLC";
const WEBSITE = "https://lepondykitchen.com/restaurant";

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    console.log("Opening LePondy Kitchen...");

    await page.goto(WEBSITE, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    // Enable Flutter accessibility if available.
    const accessibilityButton = page.locator(
      '[aria-label="Enable accessibility"]'
    );

    if (await accessibilityButton.count()) {
      await accessibilityButton.first().evaluate(
        (element) => element.click()
      );

      await page.waitForTimeout(2000);
    }

    // Select the requested vendor.
    const vendorButton =
      VENDOR === "Food"
        ? page.getByRole("button", {
            name: /^Food\b/i
          })
        : VENDOR === "Native Grocers LLC"
          ? page.getByRole("button", {
              name: "Native Grocers LLC Columbus,ohio",
              exact: true
            })
          : null;

    if (!vendorButton) {
      throw new Error(
        `Unsupported vendor "${VENDOR}". ` +
        'Use "Food" or "Native Grocers LLC".'
      );
    }

    const vendorCount = await vendorButton.count();

    console.log("Requested vendor:", VENDOR);
    console.log("Vendor buttons found:", vendorCount);

    if (vendorCount === 0) {
      throw new Error(
        `Could not find the "${VENDOR}" vendor button. ` +
        "Check its accessible name on the website."
      );
    }

    await vendorButton.first().click({ timeout: 15000 });

    // Confirm vendor selection if prompted.
    const yesButton = page.getByRole("button", {
      name: "Yes",
      exact: true
    });

    if (await yesButton.count()) {
      await yesButton.first().click();
    }

    await page.waitForTimeout(3000);

    // Open the requested category.
    const categoryButton = page.getByRole("button", {
      name: CATEGORY,
      exact: true
    });

    const categoryCount = await categoryButton.count();

    console.log(`Category "${CATEGORY}" buttons found:`, categoryCount);

    if (categoryCount === 0) {
      throw new Error(
        `Could not find category "${CATEGORY}" for ${VENDOR}.`
      );
    }

    await categoryButton.first().click({ timeout: 15000 });
    await page.waitForTimeout(3000);

    // Extract product information from Flutter's accessibility tree.
    const products = await page
      .locator('flt-semantics[role="group"][aria-label]')
      .evaluateAll((elements, config) =>
        elements
          .map((element) => element.getAttribute("aria-label"))
          .filter((label) => label && /\$\s*\d/.test(label))
          .map((label) => {
            const lines = label
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);

            const prices = lines
              .filter((line) => /^\$\s*\d+(?:\.\d{1,2})?$/.test(line))
              .map((line) => Number(line.replace("$", "").trim()));

            const name =
              lines.find(
                (line) =>
                  !/^\$\s*\d/.test(line) &&
                  !/^\(\d+\)$/.test(line)
              ) || "Unknown product";

            return {
  name,
  price: prices[0] > 0 ? prices[0] : null,

  previousPrice:
    prices[1] > 0 && prices[1] !== prices[0]
      ? prices[1]
      : null,

  source: config.website,
  vendor: config.vendor,
  category: config.category,
  extractedAt: config.extractedAt
};
          }),
        {
          website: WEBSITE,
          vendor: VENDOR,
          category: CATEGORY,
          extractedAt: new Date().toISOString()
        }
      );

    // Never create an empty product file when extraction fails.
    if (products.length === 0) {
      throw new Error(
        `No products found in "${CATEGORY}" for "${VENDOR}". ` +
        "Check the vendor, category name, and website state."
      );
    }

    const output = {
      website: WEBSITE,
      vendor: VENDOR,
      category: CATEGORY,
      productCount: products.length,
      products
    };

    const safeVendor = VENDOR.toLowerCase().replace(
      /[^a-z0-9]+/g,
      "-"
    ).replace(/^-|-$/g, "");

    const safeCategory = CATEGORY.toLowerCase().replace(
      /[^a-z0-9]+/g,
      "-"
    ).replace(/^-|-$/g, "");

    const outputPath = path.join(
      __dirname,
      `products-${safeVendor}-${safeCategory}.json`
    );

    fs.writeFileSync(
      outputPath,
      JSON.stringify(output, null, 2),
      "utf8"
    );

    console.log("\nExtraction successful!");
    console.log("Vendor:", VENDOR);
    console.log("Category:", CATEGORY);
    console.log("Products extracted:", products.length);
    console.log("Saved to:", outputPath);
    console.log("\nExtracted products:");
    console.log(JSON.stringify(products, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("\nExtraction failed:", error.message);
  process.exit(1);
});
