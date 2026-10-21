
const fs = require("fs");
const path = require("path");

const folder = __dirname;
const outputFile = path.join(folder, "products-all.json");

// Read category files, but don't read our combined output on reruns.
const files = fs.readdirSync(folder).filter(file =>
  /^products-.+\.json$/i.test(file) &&
  file.toLowerCase() !== "products-all.json"
);

if (files.length === 0) {
  throw new Error("No product category JSON files were found.");
}

const uniqueProducts = new Map();
let sourceRecordCount = 0;

for (const file of files) {
  const filePath = path.join(folder, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!Array.isArray(data.products)) {
    console.warn(`Skipping ${file}: no products array found.`);
    continue;
  }

  for (const product of data.products) {
    if (!product.name || !product.vendor) {
      console.warn(`Skipping incomplete product in ${file}.`);
      continue;
    }

    sourceRecordCount++;

    // Match exact product names and vendors, ignoring case and extra spaces.
    const key = `${product.vendor.trim().toLowerCase()}::${product.name
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()}`;

    if (!uniqueProducts.has(key)) {
      uniqueProducts.set(key, {
        ...product,
        categories: [product.category].filter(Boolean)
      });
    } else {
      const existing = uniqueProducts.get(key);

      if (
        product.category &&
        !existing.categories.includes(product.category)
      ) {
        existing.categories.push(product.category);
      }

      // Keep the latest extraction timestamp; don't silently replace prices.
      if (
        product.extractedAt &&
        (!existing.extractedAt ||
          product.extractedAt > existing.extractedAt)
      ) {
        existing.extractedAt = product.extractedAt;
      }

      if (
        existing.price !== product.price ||
        existing.previousPrice !== product.previousPrice
      ) {
        console.warn(
          `Price mismatch for "${product.name}". Review the source files.`
        );
      }
    }
  }
}

const catalog = {
  website: "https://lepondykitchen.com/restaurant",
  vendor: "Native Grocers LLC",
  generatedAt: new Date().toISOString(),
  sourceFiles: files,
  sourceRecordCount,
  uniqueProductCount: uniqueProducts.size,
  products: [...uniqueProducts.values()]
};

fs.writeFileSync(
  outputFile,
  JSON.stringify(catalog, null, 2),
  "utf8"
);

console.log("Catalog created successfully!");
console.log("Category files read:", files.length);
console.log("Source records:", sourceRecordCount);
console.log("Unique products:", uniqueProducts.size);
console.log("Saved to:", outputFile);
