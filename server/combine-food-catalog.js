
const fs = require("fs");
const path = require("path");

const folder = __dirname;

const sourceFiles = [
  "products-food-biriyani.json",
  "products-food-desserts.json",
  "products-food-dosa.json",
  "products-food-drinks.json",
  "products-food-millets.json",
  "products-food-non-veg-appetizer.json",
  "products-food-non-veg-curry.json",
  "products-food-pulav.json",
  "products-food-rotti.json",
  "products-food-veg-appetizer.json",
  "products-food-veg-curry.json"
];

const products = [];

for (const file of sourceFiles) {
  const filePath = path.join(folder, file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing source file: ${file}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!Array.isArray(data.products)) {
    throw new Error(`The products array is missing in ${file}`);
  }

  products.push(...data.products);
}

// Count duplicate product names without silently deleting anything.
const nameCounts = new Map();

for (const product of products) {
  const key = product.name.trim().toLowerCase();
  nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
}

const duplicates = [...nameCounts.entries()]
  .filter(([, count]) => count > 1);

const catalog = {
  website: "https://lepondykitchen.com/restaurant",
  vendor: "Food",
  generatedAt: new Date().toISOString(),
  sourceFiles,
  sourceRecordCount: products.length,
  uniqueProductCount: nameCounts.size,
  duplicateProductNames: duplicates.map(([name, count]) => ({
    name,
    count
  })),
  products
};

const outputPath = path.join(folder, "products-food-all.json");

fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), "utf8");

console.log("Food catalog combined successfully!");
console.log(`Source files: ${sourceFiles.length}`);
console.log(`Total product records: ${products.length}`);
console.log(`Unique product names: ${nameCounts.size}`);
console.log(`Duplicate product names: ${duplicates.length}`);
console.log(`Saved to: ${outputPath}`);

if (duplicates.length > 0) {
  console.log("\nDuplicate names to review:");
  console.log(JSON.stringify(catalog.duplicateProductNames, null, 2));
}
