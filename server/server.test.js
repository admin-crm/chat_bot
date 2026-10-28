const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  app,
  findCatalogMatchesByQuery,
  getMissingInformationReply,
  findCrawledProductPrice
} = require("./server.js");


const nativeGrocerSnacks = require("./products-all.json").products.filter(
  (product) => product.vendor === "Native Grocers LLC" && product.category === "Snacks"
);

const foodCatalog = require("./products-food-all.json").products.filter(
  (product) => product.vendor === "Food"
);
const allCatalog = require("./products-all.json").products;

const businessData = {
  websiteId: "lepondy-kitchen",
  businessName: "LePondy Kitchen",
  knowledge: {
    openingHours: null,
    address: null,
    contact: null,
    menu: [],
    products: [],
    policies: []
  }
};

test("descriptive crunchy snack searches match actual catalog entries", () => {
  const matches = findCatalogMatchesByQuery(
    "What crunchy snacks are available here?",
    nativeGrocerSnacks
  );

  const names = matches.map((product) => product.name);

  assert.ok(matches.length > 0);
  assert.ok(names.includes("Thattai"));
  assert.ok(names.includes("Poondu Murukku"));
  assert.ok(names.includes("Kara Sev"));
  assert.ok(names.includes("Nendhiram Chips"));
  assert.ok(matches.every((product) => product.category === "Snacks"));
  assert.ok(!names.includes("Chicken biryani"));
});

test("location and policy questions are rejected before any product matching occurs", () => {
  const registeredReply = getMissingInformationReply(
    "Where is your company registered?",
    businessData
  );

  const refundReply = getMissingInformationReply(
    "What is your return and refund policy?",
    businessData
  );

  const locationReply = getMissingInformationReply(
    "Where is LePondy Kitchen located?",
    businessData
  );

  const locationMatches = findCatalogMatchesByQuery(
    "Where is LePondy Kitchen located?",
    allCatalog
  );

  assert.match(registeredReply, /do not have confirmed information|confirmed information/i);
  assert.match(refundReply, /do not have confirmed information|confirmed information/i);
  assert.match(locationReply, /do not have confirmed information|confirmed information/i);
  assert.deepEqual(locationMatches, []);
});

test("opening hours reply only references verified vendor hours and does not claim LePondy business hours", () => {
  const reply = getMissingInformationReply("What is the opening time?", businessData);

  assert.match(reply, /LePondy Kitchen itself|not verified|recorded hours/i);
  assert.doesNotMatch(reply, /confirmed opening time for LePondy Kitchen/i);
});

test("dessert queries stay in the dessert category and exclude unrelated matches", () => {
  const matches = findCatalogMatchesByQuery("Show me desserts.", foodCatalog);

  assert.ok(matches.length > 0);
  assert.ok(matches.some((product) => product.category === "Desserts"));
  assert.ok(!matches.some((product) => product.category === "Kitchen Equipments"));
  assert.ok(!matches.some((product) => product.category === "Snacks"));
});

test("saved crawled product data returns the exact laptop price for a direct product question", () => {
  const match = findCrawledProductPrice(
    "What is the price of Vertex Air Laptop 107?",
    "testingurl-demo"
  );

  assert.deepEqual(match, {
    name: "Vertex Air Laptop 107",
    price: 86,
    currency: "USD"
  });
});


test("API answers general non-business questions without being blocked by saved crawled-website instructions", async (t) => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  t.after(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }

    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  process.env.GEMINI_API_KEY = "test-api-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "Artificial intelligence allows computers to perform tasks that usually require human intelligence."
              }
            ]
          }
        }
      ]
    })
  });

  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Explain what artificial intelligence is in simple words",
      websiteId: "testingurl-demo"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /artificial intelligence|AI/i);
  assert.doesNotMatch(response.body.reply, /saved crawled website information|do not have confirmed information/i);
});


test("API returns Native Grocers product price and previous price", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "What is the price of SDPMart Premium Moong Dhal?",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /SDPMart Premium Moong Dhal/);
  assert.match(response.body.reply, /\$7\.49/);
  assert.match(response.body.reply, /Previous price: \$8\.49/);
});

test("API returns the confirmed Food catalog price", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "What is the price of Potato channa biryani?",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Potato channa biryani/);
  assert.match(response.body.reply, /\$9\.99/);
});

test("API does not invent a price for Chicken biryani", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "What is the price of Chicken biryani?",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(
    response.body.reply,
    /price.*not available in the current catalog/i
  );
  assert.doesNotMatch(response.body.reply, /\$\d+(?:\.\d{2})?/);
});

test("API returns the saved TestingURL laptop price", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "What is the price of Vertex Air Laptop 107?",
      websiteId: "testingurl-demo"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Vertex Air Laptop 107/);
  assert.match(response.body.reply, /86 USD/);
});


test("API rejects an empty message", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({ message: "" })
    .expect(400);

  assert.equal(response.body.success, false);
  assert.match(response.body.message, /valid message/i);
});

test("API rejects a request with a missing message", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({})
    .expect(400);

  assert.equal(response.body.success, false);
  assert.match(response.body.message, /valid message/i);
});

test("API rejects an unknown website ID", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Hello",
      websiteId: "unknown-demo"
    })
    .expect(400);

  assert.equal(response.body.success, false);
  assert.match(response.body.message, /unknown website configuration/i);
});


test("API lists Food catalog products for a standalone Food selection", async () => {
  const expectedProduct = foodCatalog[0];

  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Food",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Products recorded for Food/i);
  assert.ok(
    response.body.reply.includes(expectedProduct.name),
    `Expected Food catalog product "${expectedProduct.name}" in the reply`
  );
});

test("API lists Native Grocers products for a standalone vendor selection", async () => {
  const expectedProduct = allCatalog.find(
    (product) => product.vendor === "Native Grocers LLC"
  );

  assert.ok(expectedProduct, "Expected at least one Native Grocers product");

  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Native Grocers LLC",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Products recorded for Native Grocers LLC/i);
  assert.ok(
    response.body.reply.includes(expectedProduct.name),
    `Expected Native Grocers product "${expectedProduct.name}" in the reply`
  );
});

test("API lists Food menu products for a menu-only request without an explicit vendor", async () => {
  const expectedProduct = foodCatalog.find((product) => product.name);

  assert.ok(expectedProduct, "Expected at least one Food product");

  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "List all menu products",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Products recorded for Food/i);
  assert.ok(
    response.body.reply.includes(expectedProduct.name),
    `Expected Food menu product "${expectedProduct.name}" in the reply`
  );
  assert.doesNotMatch(response.body.reply, /Products recorded for Native Grocers LLC/i);
});

test("API lists Native Grocers grocery products for a grocery-only request without an explicit vendor", async () => {
  const expectedProduct = allCatalog.find(
    (product) => product.vendor === "Native Grocers LLC"
  );

  assert.ok(expectedProduct, "Expected at least one Native Grocers product");

  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "List all grocery products",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Products recorded for Native Grocers LLC/i);
  assert.ok(
    response.body.reply.includes(expectedProduct.name),
    `Expected grocery product "${expectedProduct.name}" in the reply`
  );
  assert.doesNotMatch(response.body.reply, /Products recorded for Food/i);
});


test("API limits explicit Food dessert searches to Food catalog products", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Show me Food desserts",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);

  const productNames = response.body.reply
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  assert.ok(productNames.length > 0);
  assert.ok(
    productNames.every((name) =>
      foodCatalog.some((product) => product.name === name)
    ),
    "Expected every result to come from the Food catalog"
  );
});

test("API limits explicit Native Grocers snack searches to Native Grocers snacks", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Show me Native Grocers snacks",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);

  const productNames = response.body.reply
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  const expectedNames = nativeGrocerSnacks.map((product) => product.name);

  assert.ok(productNames.length > 0);
  assert.ok(
    productNames.every((name) => expectedNames.includes(name)),
    "Expected every result to come from the Native Grocers snack catalog"
  );
});

test("millet noodles queries match the Native Grocers category before generic millet matches", () => {
  const matches = findCatalogMatchesByQuery(
    "Do you have any millet noodles?",
    allCatalog
  );

  const names = matches.map((product) => product.name);

  assert.ok(matches.length > 0);
  assert.ok(
    names.some((name) => /millet noodles/i.test(name)),
    "Expected Millet Noodles products to match"
  );
  assert.ok(
    matches.every((product) => product.vendor === "Native Grocers LLC"),
    "Expected millet noodles results to stay within Native Grocers"
  );
  assert.ok(
    !names.some((name) => /cookies/i.test(name) || /food/i.test(name)),
    "Expected no unrelated Food millet dishes or cookies in millet-noodles results"
  );
});

test("API lists all available menu categories when asked explicitly", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Show me all available menu categories",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Available menu categories:/i);
  assert.match(response.body.reply, /Food:/i);
  assert.match(response.body.reply, /Native Grocers LLC:/i);
  assert.match(response.body.reply, /Biriyani/i);
  assert.match(response.body.reply, /Millet Noodles/i);
  assert.doesNotMatch(response.body.reply, /Potato channa biryani/i);
});

test("API gives a natural catalog summary before asking which vendor to browse", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Hey! What kind of products do you sell?",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Food and Native Grocers LLC/i);
  assert.match(response.body.reply, /restaurant dishes/i);
  assert.match(response.body.reply, /grocery and household products/i);
  assert.match(response.body.reply, /Which catalog would you like to browse/i);
});

test("API uses verified Veg categories for vegetarian queries and does not guess by name", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Do you have any vegetarian dishes?",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Verified vegetarian categories/i);
  assert.match(response.body.reply, /Veg/i);
  assert.match(response.body.reply, /explicitly labeled as Veg/i);
});

test("API returns relevant dessert products for a category search", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Show me desserts",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Food items in this category:/i);
  assert.match(response.body.reply, /Bread Halwa/i);
  assert.match(response.body.reply, /Badam Halwa/i);
  assert.match(response.body.reply, /Rasamalai/i);
  assert.doesNotMatch(response.body.reply, /Chicken biryani/i);
});

test("API returns at most 12 biryani products for a category search", async () => {
  const response = await request(app)
    .post("/api/chat")
    .send({
      message: "Show me biryani",
      websiteId: "lepondy-kitchen"
    })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.match(response.body.reply, /Food items in this category:/i);
  assert.match(response.body.reply, /Potato channa biryani/i);

  const productLines = response.body.reply
    .split("\n")
    .filter((line) => line.startsWith("- "));

  assert.ok(productLines.length > 0);
  assert.ok(
    productLines.length <= 12,
    `Expected at most 12 products, got ${productLines.length}`
  );

  assert.ok(
    productLines.every((line) => /\bbiryani\b/i.test(line)),
    "Expected every listed product to match the biryani category"
  );
});
