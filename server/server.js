
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { chromium } = require("playwright");
const dns = require("node:dns").promises;
const net = require("node:net");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://localhost:11434/api/chat";

const MODEL_NAME =
  process.env.MODEL_NAME || "qwen2.5:1.5b";

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Load business and vendor knowledge
const knowledgeFolder = path.join(
  __dirname,
  "..",
  "knowledge"
);

const knowledgePath = path.join(
  knowledgeFolder,
  "lepondy.json"
);


const websiteConfigs = {
  "lepondy-kitchen": {
    knowledgeFile: "lepondy.json"
  },

  "testingurl-demo": {
  businessName: "TestingURL Demo",
  businessType: "E-commerce Demo",
  websiteUrl: "https://testingurl.dev"
}
};



function loadWebsiteKnowledge(websiteId) {
  const config = websiteConfigs[websiteId];

  if (!config) {
    return null;
  }

  // Dynamically crawled websites use their saved crawl data.
  if (!config.knowledgeFile) {
    const crawledData = loadCrawledWebsiteData(websiteId);



    if (!crawledData) {
      return null;
    }

    return {
      businessName: config.businessName,
      businessType: config.businessType,
      websiteUrl: config.websiteUrl,
      knowledge: {
        description: `This chatbot uses crawled information from ${config.websiteUrl}.`
      },
      instructions: {
        rules: [
          "Answer using the saved crawled website information.",
          "Do not invent product prices or business details."
        ]
      },
      crawledWebsite: crawledData
    };
  }

  const filePath = path.join(
    knowledgeFolder,
    config.knowledgeFile
  );

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}




let businessData;
let foodData;
let nativeGrocersData;

try {
  businessData = JSON.parse(
    fs.readFileSync(knowledgePath, "utf8")
  );

  foodData = JSON.parse(
    fs.readFileSync(
      path.join(knowledgeFolder, "food.json"),
      "utf8"
    )
  );

  nativeGrocersData = JSON.parse(
    fs.readFileSync(
      path.join(knowledgeFolder, "native-grocers.json"),
      "utf8"
    )
  );
} catch (error) {
  console.error(
    "Could not load business or vendor knowledge:",
    error.message
  );
  process.exit(1);
}

// Load the extracted Native Grocers product catalog
const extractedCatalogPath = path.join(
  __dirname,
  "products-all.json"
);

 // Load the combined Food product catalog
const foodCatalogPath = path.join(
  __dirname,
  "products-food-all.json"
);

let extractedFoodCatalog;

try {
  extractedFoodCatalog = JSON.parse(
    fs.readFileSync(foodCatalogPath, "utf8")
  );

  if (
    !extractedFoodCatalog ||
    !Array.isArray(extractedFoodCatalog.products)
  ) {
    throw new Error("Food catalog must contain a products array.");
  }

  console.log(
    `Food product catalog loaded: ${extractedFoodCatalog.products.length} products`
  );
} catch (error) {
  console.error(
    "Could not load extracted Food catalog:",
    error.message
  );
  process.exit(1);
}

let extractedProductCatalog;

try {
  extractedProductCatalog = JSON.parse(
    fs.readFileSync(extractedCatalogPath, "utf8")
  );

  if (
    !extractedProductCatalog ||
    !Array.isArray(extractedProductCatalog.products)
  ) {
    throw new Error("Catalog must contain a products array.");
  }

  console.log(
    `Extracted product catalog loaded: ${extractedProductCatalog.products.length} products`
  );
} catch (error) {
  console.error(
    "Could not load extracted product catalog:",
    error.message
  );
  process.exit(1);
}

const knowledge = businessData.knowledge || {};

function getLePondyVerifiedFacts() {
  return {
    businessName: businessData.businessName || null,
    businessType: businessData.businessType || null,
    websiteUrl: businessData.websiteUrl || null,
    address: knowledge.address || null,
    openingHours: knowledge.openingHours || null,
    contact: knowledge.contact || null,
    menu: Array.isArray(knowledge.menu) ? knowledge.menu : [],
    products: Array.isArray(knowledge.products) ? knowledge.products : [],
    policies: Array.isArray(knowledge.policies) ? knowledge.policies : []
  };
}

function hasConfirmedLePondyFacts() {
  const verifiedFacts = getLePondyVerifiedFacts();

  return [
    verifiedFacts.businessName,
    verifiedFacts.businessType,
    verifiedFacts.websiteUrl,
    verifiedFacts.address,
    verifiedFacts.openingHours,
    verifiedFacts.contact,
    ...verifiedFacts.menu,
    ...verifiedFacts.products,
    ...verifiedFacts.policies
  ].some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    return Boolean(value);
  });
}

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Universal Chatbot API is running!",
    business: businessData.businessName
  });
});

// Normalize text for matching
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBusinessInformationRequest(message) {
  const question = normalizeText(message || "");

  const businessPatterns = [
    /\bopening time\b|\bopening hours?\b|\bbusiness hours?\b|\bwhen.*(open|close|opens|closes)\b|\b(open|close|opens|closes).*\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\bwhere\b.*\b(located|location|find you|restaurant)\b|\baddress\b|\blocation\b|\bdirections\b/,
    /\bcompany\b.*\b(register|registered|registration)\b|\b(register|registered|registration)\b.*\bcompany\b|\bwhere.*company.*registered\b/,
    /\brefund\b|\breturn\b|\bpolicy\b|\bpolicies\b|\bcancellation\b|\breservation\b|\bdelivery\b|\bdeliver\b|\bshipping\b|\bship to\b/,
    /\bcontact\b|\bphone\b|\btelephone\b|\bemail\b/
  ];

  return businessPatterns.some((pattern) => pattern.test(question));
}

function findCatalogMatchesByQuery(message, products) {
  const query = normalizeText(message || "");

  if (!query || !Array.isArray(products) || products.length === 0) {
    return [];
  }

  if (isBusinessInformationRequest(query)) {
    return [];
  }

  const productIntent = /\b(product|products|items?|catalog|menu|available|show|list|which|what|find|display|browse|see)\b/.test(query);
  const categoryIntent = /\b(snack|snacks|crunchy|crispy|savory|dessert|desserts|sweet|sweets|biryani|biriyani|drink|drinks|millet|millets|dosa|dosas|rotti|rotis|pulav|pulao|curry|curries|appetizer|appetizers|starter|starters)\b/.test(query);

  if (!productIntent && !categoryIntent) {
    return [];
  }

  const snackTerms = [
    "thattai",
    "murukku",
    "sev",
    "chips",
    "boondi",
    "kara",
    "mixture",
    "snack",
    "snacks"
  ];

  const dessertTerms = [
    "halwa",
    "rasamalai",
    "payasam",
    "ladoo",
    "jalebi",
    "kulfi",
    "sweet",
    "sweets",
    "dessert",
    "desserts"
  ];

  return products.filter((product) => {
    const name = normalizeText(product?.name || "");
    const category = normalizeText(product?.category || "");

    if (!name && !category) {
      return false;
    }

    if (/\b(snack|snacks|crunchy|crispy|savory)\b/.test(query)) {
      return (
        category === "snacks" ||
        snackTerms.some((term) => name.includes(term) || category.includes(term))
      );
    }

    if (/\b(dessert|desserts|sweet|sweets)\b/.test(query)) {
      return (
        category === "desserts" ||
        dessertTerms.some((term) => name.includes(term) || category.includes(term))
      );
    }

    if (/\b(biryani|biriyani)\b/.test(query)) {
      return (
        category.includes("biryani") ||
        category.includes("biriyani") ||
        name.includes("biryani") ||
        name.includes("biriyani")
      );
    }

    if (/\b(drink|drinks|beverage|beverages)\b/.test(query)) {
      return category.includes("drink") || name.includes("tea") || name.includes("coffee") || name.includes("lassi");
    }

    if (/\b(millet|millets)\b/.test(query)) {
      return category.includes("millet") || name.includes("millet");
    }

    if (/\b(dosa|dosas)\b/.test(query)) {
      return category.includes("dosa") || name.includes("dosa");
    }

    if (/\b(rotti|rotis)\b/.test(query)) {
      return category.includes("rotti") || name.includes("rotti");
    }

    if (/\b(pulav|pulao|pilaf)\b/.test(query)) {
      return category.includes("pulav") || category.includes("pulao") || name.includes("pulav") || name.includes("pulao");
    }

    if (/\b(curry|curries)\b/.test(query)) {
      return category.includes("curry") || name.includes("curry");
    }

    if (/\b(appetizer|appetizers|starter|starters)\b/.test(query)) {
      return category.includes("appetizer") || category.includes("starter") || name.includes("65") || name.includes("fry");
    }

    return false;
  });
}

function getVendorContext(message) {
  const question = normalizeText(message);


if (/\bnative grocers(?: llc)?\b/.test(question)) {
  return {
    name: "Native Grocers LLC",
    data: {
      ...nativeGrocersData,
      products: extractedProductCatalog.products.filter(
        (product) => product.vendor === "Native Grocers LLC"
      )
    }
  };
}


  if (
  /\bfood\b/.test(question) &&
  (
    /\b(vendor|products?|prices?|items?|available|from|menus?|desserts?|snacks?|crunchy|crispy|savory|biryani|biriyani|drinks?|millets?|dosa|rotti|pulav|pulao|curry|appetizers?)\b/.test(question) ||
    /^food$/.test(question)
  )
) {
    return {
      name: "Food",
      data: foodData
    };
  }


  // Identify Native Grocers products by their catalog names,
  // allowing customers to omit the SDPMart brand prefix.
  const nativeProduct = extractedProductCatalog.products.find((product) => {
    const normalizedName = normalizeText(product.name);
    const nameWithoutBrand = normalizedName.replace(/^sdpmart\s+/, "");

    return (
      question.includes(normalizedName) ||
      (
        nameWithoutBrand !== normalizedName &&
        question.includes(nameWithoutBrand)
      )
    );
  });

  if (nativeProduct) {
  return {
    name: "Native Grocers LLC",
    data: {
      ...nativeGrocersData,
      products: extractedProductCatalog.products.filter(
        (product) => product.vendor === "Native Grocers LLC"
      )
    }
  };
}

  // Identify Food products by their catalog names.
  const normalizedQuestion = question.replace(/\bbiriyani\b/g, "biryani");

  const foodProduct = extractedFoodCatalog.products.find((product) => {
    const normalizedName = normalizeText(product.name)
      .replace(/\bbiriyani\b/g, "biryani");

    return normalizedQuestion.includes(normalizedName);
  });

  if (foodProduct) {
    return {
      name: "Food",
      data: foodData
    };
  }

  return null;
}


function getLePondyCatalogProducts(vendorName) {
  const vendor = String(vendorName || "").trim();

  if (!vendor) {
    return [];
  }

  if (vendor === "Food") {
    return extractedFoodCatalog.products.filter(
      (product) => product.vendor === "Food"
    );
  }

  if (vendor === "Native Grocers LLC") {
    return extractedProductCatalog.products.filter(
      (product) => product.vendor === "Native Grocers LLC"
    );
  }

  return [];
}

function findCrawledProductPrice(message, websiteId) {
  const config = websiteConfigs[websiteId];

  if (!config || config.knowledgeFile) {
    return null;
  }

  const crawledData = loadCrawledWebsiteData(websiteId);

  if (!crawledData || !Array.isArray(crawledData.pages)) {
    return null;
  }

  const question = normalizeText(message || "");

  if (!question || !/\b(price|cost|how much)\b/.test(question)) {
    return null;
  }

  const productMatches = new Map();

  for (const page of crawledData.pages) {
    for (const product of page.products || []) {
      const rawName = String(product?.name || "").trim();
      const normalizedProductName = normalizeText(rawName);

      if (!rawName || normalizedProductName.length < 3) {
        continue;
      }

      if (!question.includes(normalizedProductName)) {
        continue;
      }

      const price = Number(product.price);

      if (!Number.isFinite(price)) {
        continue;
      }

      if (!productMatches.has(normalizedProductName)) {
        productMatches.set(normalizedProductName, {
          name: rawName,
          price,
          currency:
            typeof product.currency === "string" && product.currency.trim()
              ? product.currency.trim().toUpperCase()
              : "USD"
        });
      }
    }
  }

  return productMatches.values().next().value || null;
}

// Determine whether a business-information category is missing.
function getMissingInformationReply(message, selectedBusinessData) {
  const question = normalizeText(message);
  const knowledgeData = selectedBusinessData?.knowledge || {};
  const businessName =
    selectedBusinessData?.businessName || "this business";

  const isLePondy =
    selectedBusinessData?.websiteId === "lepondy-kitchen";

  const vendorContext = isLePondy
    ? getVendorContext(message)
    : null;

  if (
    isLePondy &&
    !vendorContext &&
    /\blepondy\b/.test(question) &&
    !hasConfirmedLePondyFacts()
  ) {
    return (
      "Confirmed information about LePondy Kitchen is limited. " +
      "I do not have verified details about the website, vendors, products, or prices."
    );
  }

  if (
    vendorContext &&
    /\b(product|products|price|prices|item|items|menu|available|stock)\b/.test(question)
  ) {
        const vendorProducts = getLePondyCatalogProducts(
      vendorContext.name
    );

    if (vendorProducts.length === 0) {
      return (
        "I don't have verified product and price information for " +
        `${vendorContext.name} yet.`
      );
    }

    return null;
  }

  const checks = [
    {
      label: "opening hours",
      value: knowledgeData.openingHours,
      patterns: [
  /\bopening time\b/,
  /\bopening times\b/,
  /\bopening hours?\b/,
  /\bbusiness hours?\b/,
  /\bwhen.*(open|close|opens|closes)\b/,
  /\b(open|close|opens|closes).*\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
]
    },
    {
      label: "company registration",
      value: null,
      patterns: [
        /\bcompany\b.*\b(register|registered|registration)\b/,
        /\b(register|registered|registration)\b.*\bcompany\b/,
        /\bwhere.*company.*registered\b/
      ]
    },
    {
      label: "address or location",
      value: knowledgeData.address,
      patterns: [
        /\baddress\b/,
        /\bwhere\b.*\b(located|location|find you|restaurant)\b/,
        /\blocation\b/,
        /\bdirections\b/
      ]
    },
    {
      label: "contact details",
      value: knowledgeData.contact,
      patterns: [
        /\bcontact\b/,
        /\bphone\b/,
        /\btelephone\b/,
        /\bmobile number\b/,
        /\bemail\b/,
        /\bcall you\b/
      ]
    },
    {
      label: "menu or product information",
      value: [
        ...(Array.isArray(knowledgeData.menu)
          ? knowledgeData.menu
          : []),
        ...(Array.isArray(knowledgeData.products)
          ? knowledgeData.products
          : [])
      ],
      patterns: [
        /\bmenu\b/,
        /\bwhat (food|dishes|items|meals|products)\b/,
        /\bwhat do you serve\b/,
        /\bfood items\b/,
        /\bavailable dishes\b/,
        /\bvegetarian\b/,
        /\bnon vegetarian\b/,
        /\bveg\b/,
        /\bnon veg\b/,
        /\bprice\b/,
        /\bcost\b/,
        /\bhow much\b/,
        /\b\d+\s*(rupees|rs|inr)\b/
      ]
    },
    {
      label: "business policies",
      value: Array.isArray(knowledgeData.policies)
        ? knowledgeData.policies
        : [],
      patterns: [
  /\bpolicy\b/,
  /\bpolicies\b/,
  /\bcancellation\b/,
  /\brefund\b/,
  /\breservation\b/,
  /\btable booking\b/,
  /\bdelivery\b/,
  /\bdeliver\b/,
  /\bshipping\b/,
  /\bship to\b/,
  /\breturn\b/
]
    }
  ];

  const matchedCheck = checks.find((item) =>
    item.patterns.some((pattern) => pattern.test(question))
  );

  if (!matchedCheck) return null;

  const value = matchedCheck.value;

  const hasInformation = Array.isArray(value)
    ? value.length > 0
    : typeof value === "string"
      ? value.trim().length > 0
      : Boolean(value);

  if (hasInformation) return null;

  if (matchedCheck.label === "opening hours") {
    const vendorHours = [foodData?.openingHours, nativeGrocersData?.openingHours].find(
      (vendor) => vendor && (vendor.opens || vendor.closes)
    );

    if (vendorHours) {
      return (
        "I do not have a verified opening time for LePondy Kitchen itself. " +
        `The only recorded hours I can confirm in this repository are ${vendorHours.opens || "not specified"} to ${vendorHours.closes || "not specified"} for the ${vendorHours.vendorName || "listed vendor"}, which are not confirmed as the business-wide schedule.`
      );
    }
  }

  if (
    ["address or location", "business policies"].includes(matchedCheck.label) ||
    /\b(register|registered|registration|company|location|refund|return|policy)\b/.test(question)
  ) {
    return (
      `I do not have confirmed information about ${matchedCheck.label} for ${businessName}. ` +
      "Please contact the business directly for accurate details."
    );
  }

  return (
    `Sorry, I don't have confirmed information about our ` +
    `${matchedCheck.label} yet. Please contact ` +
    `${businessName} directly for accurate details.`
  );
}

function loadCrawledWebsiteData(websiteId) {
  const safeWebsiteId = String(websiteId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const storageFile = path.join(
    __dirname,
    "crawled-data",
    `${safeWebsiteId}.json`
  );

  if (!fs.existsSync(storageFile)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(storageFile, "utf8")
    );
  } catch (error) {
    console.error(
      "Could not read crawled website data:",
      error.message
    );
    return null;
  }
}

// Chatbot endpoint
app.post("/api/chat", async (req, res) => {


const { message, websiteId = "lepondy-kitchen" } = req.body || {};

const websiteConfig = websiteConfigs[websiteId];

if (!websiteConfig) {
  return res.status(400).json({
    success: false,
    message: "Unknown website configuration."
  });
}



  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid message."
    });
  }

  const userMessage = message.trim();

  const normalizedMessage = normalizeText(userMessage);
  const selectedVendor =
  websiteId === "lepondy-kitchen"
    ? getVendorContext(userMessage)
    : null;


  // Answer Native Grocers product-price questions directly from the catalog.
  if (
    websiteId === "lepondy-kitchen" &&
    selectedVendor?.name === "Native Grocers LLC" &&
    /\b(price|cost|how much)\b/i.test(userMessage)
  ) {
    const catalogProducts = extractedProductCatalog.products.filter(
      (product) => product.vendor === "Native Grocers LLC"
    );


const normalizedQuestion = normalizeText(userMessage);

const matchedProduct = catalogProducts.find((product) => {
  const normalizedName = normalizeText(product.name);

  // Also match the product name without the SDPMart brand prefix.
  const productNameWithoutBrand = normalizedName.replace(
    /^sdpmart\s+/,
    ""
  );

  return (
    normalizedQuestion.includes(normalizedName) ||
    (
      productNameWithoutBrand !== normalizedName &&
      normalizedQuestion.includes(productNameWithoutBrand)
    )
  );
});



if (matchedProduct) {
  const hasConfirmedPrice =
    typeof matchedProduct.price === "number" &&
    Number.isFinite(matchedProduct.price) &&
    matchedProduct.price > 0;

  if (!hasConfirmedPrice) {
    return res.json({
      success: true,
      reply: `The price of ${matchedProduct.name} is not available in the current catalog.`
    });
  }

  const previousPriceText =
    typeof matchedProduct.previousPrice === "number" &&
    Number.isFinite(matchedProduct.previousPrice)
      ? ` Previous price: $${matchedProduct.previousPrice.toFixed(2)}.`
      : "";

  return res.json({
    success: true,
    reply: `The price of ${matchedProduct.name} from Native Grocers LLC is $${matchedProduct.price.toFixed(2)}.${previousPriceText}`
  });
}

} // Close Native Grocers price-handling block.

  // Answer Food product-price questions directly from the catalog.
  if (
    websiteId === "lepondy-kitchen" &&
    /\b(price|cost|how much)\b/i.test(userMessage)
  ) {
    const catalogProducts = extractedFoodCatalog.products.filter(
      (product) => product.vendor === "Food"
    );

    const normalizeFoodProductText = (value) =>
      normalizeText(value).replace(/\bbiriyani\b/g, "biryani");

    const normalizedQuestion = normalizeFoodProductText(userMessage);

    const matchedProduct = catalogProducts.find((product) => {
      const normalizedName = normalizeFoodProductText(product.name);
      return normalizedQuestion.includes(normalizedName);
    });

    if (matchedProduct) {
      const hasConfirmedPrice =
        typeof matchedProduct.price === "number" &&
        Number.isFinite(matchedProduct.price) &&
        matchedProduct.price !== 0;

      if (hasConfirmedPrice) {
        const previousPriceText =
          typeof matchedProduct.previousPrice === "number"
            ? ` Previous price: $${matchedProduct.previousPrice.toFixed(2)}.`
            : "";

        return res.json({
          success: true,
          reply: `The price of ${matchedProduct.name} from Food is $${matchedProduct.price.toFixed(2)}.${previousPriceText}`
        });
      }

      return res.json({
        success: true,
        reply: `The price of ${matchedProduct.name} is not available in the current catalog.`
      });
    }

    return res.json({
      success: true,
      reply: "I couldn't match that product in the current catalog. Please check the product name or provide more details."
    });
  }


  const isVendorOnlySelection =
  /^(food|native grocers(?: llc)?)$/.test(normalizedMessage);

if (
  selectedVendor &&
  (
    isVendorOnlySelection ||
    (
      /\b(list|show|what|which|available|menu)\b/.test(normalizedMessage) &&
      /\b(products?|items?|catalog|menu)\b/.test(normalizedMessage)
    )
  )
) {
    const products = getLePondyCatalogProducts(selectedVendor.name);

    if (products.length === 0) {
      return res.json({
        success: true,
        reply: `Products recorded for ${selectedVendor.name}:\nNo products found for this vendor.\n\nThese products were extracted from the website catalog and may not reflect current availability or prices.`
      });
    }

    const productList = products
      .map((product) => {
        const priceText =
          typeof product.price === "number" && Number.isFinite(product.price)
            ? ` ($${product.price.toFixed(2)})`
            : "";

        const displayName = String(product.name || "")
  .trim()
  .replace(/\s+/g, " ");

return `- ${displayName}${priceText}`;
      })
      .join("\n");

    return res.json({
      success: true,
      reply: `Products recorded for ${selectedVendor.name}:\n${productList}\n\nThese products were extracted from the website catalog and may not reflect current availability or prices.`
    });
  }

  // Handle general product-listing questions without requiring a vendor name.
  const asksForProducts =
    /\b(list|show|display|give|browse|find|see|what|which)\b/.test(normalizedMessage) &&
    /\b(products?|items?|catalog|menu)\b/.test(normalizedMessage);

  const asksForAllWebsiteProducts =
  asksForProducts &&
  !selectedVendor &&
  /\b(lepondy|website|here|all|every|kitchen|menu|products?)\b/.test(normalizedMessage) &&
  !/\b(millet|millets|dessert|desserts|sweet|sweets|drink|drinks|beverage|beverages|dosa|dosas|rotti|rotis|biryani|biriyani|snack|snacks|curry|curries|pulav|pulao)\b/.test(normalizedMessage);

  if (
    websiteId === "lepondy-kitchen" &&
    asksForAllWebsiteProducts
  ) {
    return res.json({
      success: true,
      reply: "We have two vendor catalogs here: Food and Native Grocers LLC. Which vendor would you like to browse?"
    });
  }



  if (userMessage.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Please keep your message under 2000 characters."
    });
  }

const crawledWebsiteData = loadCrawledWebsiteData(websiteId);
const selectedBusinessData = loadWebsiteKnowledge(websiteId);

if (!selectedBusinessData) {
  return res.status(400).json({
    success: false,
    message: "Could not load website configuration."
  });
}

if (
  websiteId === "lepondy-kitchen" &&
  /\b(tell me about|describe|what website|website is this|this website|about this website)\b/.test(normalizedMessage)
) {
  const description = selectedBusinessData.knowledge?.description ||
    `This is ${selectedBusinessData.businessName || "LePondy Kitchen"}.`;

  return res.json({
    success: true,
    reply: `${selectedBusinessData.businessName || "LePondy Kitchen"} is the website for ${selectedBusinessData.websiteUrl || "the business"}. ${description}`
  });
}

const crawledProductMatch = findCrawledProductPrice(userMessage, websiteId);

if (crawledProductMatch) {
  return res.json({
    success: true,
    reply: `The price of ${crawledProductMatch.name} is ${crawledProductMatch.price} ${crawledProductMatch.currency}.`
  });
}

if (isBusinessInformationRequest(userMessage)) {
  const businessReply = getMissingInformationReply(userMessage, selectedBusinessData);

  if (businessReply) {
    return res.json({
      success: true,
      reply: businessReply
    });
  }
}

if (
  /\bwhat is lepondy kitchen\b|\bdescribe lepondy kitchen\b|\btell me about lepondy kitchen\b/i.test(userMessage) &&
  selectedBusinessData.knowledge?.description
) {
  return res.json({
    success: true,
    reply: selectedBusinessData.knowledge.description
  });
}

if (
  websiteId === "lepondy-kitchen" &&
  /\bwhat products do you sell\b|\bwhat products are available\b|\blist your products\b|\bshow me your products\b/i.test(userMessage) &&
  !getVendorContext(userMessage)
) {
  return res.json({
    success: true,
    reply:
      "We have two vendor options: Food and Native Grocers LLC. Which vendor's products would you like to explore?"
  });
}

if (websiteId === "lepondy-kitchen") {
  const foodCatalogProducts = extractedFoodCatalog.products.filter(
    (product) => product.vendor === "Food"
  );

if (
  websiteId === "lepondy-kitchen" &&
  /\b(what kind of food|what types of food|what food do you offer|what food do you sell|what do you serve|what dishes do you offer)\b/i.test(userMessage)
) {
  const foodProducts = extractedFoodCatalog.products
    .filter((product) => product.vendor === "Food")
    .filter((product) => product.name);

  const categories = [
    ...new Set(
      foodProducts
        .map((product) => product.category)
        .filter(Boolean)
    )
  ];

  if (categories.length > 0) {
    return res.json({
      success: true,
      reply:
        "The Food catalog includes products in these categories: " +
        categories.join(", ") +
        ". Ask me about a category to see matching items."
    });
  }

  return res.json({
    success: true,
    reply:
      "I have a Food product catalog, but I don't have enough verified category information to summarize it yet."
  });
}
  const groceryCatalogProducts = extractedProductCatalog.products.filter(
    (product) => product.vendor === "Native Grocers LLC"
  );

  const normalizedQuery = normalizeText(userMessage)
  .replace(
    /\b(show|me|list|display|give|browse|find|see|what|which|are|available|do|you|have|here|products?|items?|catalog|menu|please)\b/g,
    " "
  )
  .replace(/\s+/g, " ")
  .trim();

  const categoryProducts = selectedVendor
  ? selectedVendor.name === "Food"
    ? foodCatalogProducts
    : groceryCatalogProducts
  : [
      ...foodCatalogProducts,
      ...groceryCatalogProducts
    ];

const categoryMatches = findCatalogMatchesByQuery(
  normalizedQuery,
  categoryProducts
);

  if (normalizedQuery && categoryMatches.length > 0) {
    const categoryList = categoryMatches
      .map((product) => `- ${product.name}`)
      .slice(0, 12)
      .join("\n");

    const heading = /\b(snack|snacks|crunchy|crispy|savory)\b/.test(normalizedQuery)
      ? "Matching snack products in the catalog:"
      : "Food items in this category:";

    return res.json({
      success: true,
      reply: `${heading}\n${categoryList}`
    });
  }
}

const missingInformationReply =
  getMissingInformationReply(userMessage, selectedBusinessData);

if (missingInformationReply) {
  return res.json({
    success: true,
    reply: missingInformationReply
  });
}

const selectedKnowledge = selectedBusinessData.knowledge || {};

const businessRules = Array.isArray(
  selectedBusinessData.instructions?.rules
)
  ? selectedBusinessData.instructions.rules.join("\n")
  : "";

const vendorContext = websiteId === "lepondy-kitchen"
  ? getVendorContext(userMessage)
  : null;

const lePondyVerifiedFacts = websiteId === "lepondy-kitchen"
  ? getLePondyVerifiedFacts()
  : null;


const knowledgeContext = JSON.stringify(
  {
    businessKnowledge:
      websiteId === "lepondy-kitchen"
        ? {
            lePondyKitchen: {
              ...lePondyVerifiedFacts
            },
            foodVendor: foodData,
            nativeGrocers: nativeGrocersData,
            selectedVendor: vendorContext
              ? {
                  vendorName: vendorContext.name,
                  ...vendorContext.data
                }
              : null
          }
        : selectedBusinessData,

    crawledWebsite: crawledWebsiteData
      ? {
          startingUrl: crawledWebsiteData.startingUrl,
          pages: crawledWebsiteData.pages.map((page) => ({
            url: page.url,
            title: page.title,
            text: page.text,
            products: page.products
          }))
        }
      : null
  },
  null,
  2
);


const systemPrompt = `
You are the virtual assistant for ${selectedBusinessData.businessName}.
Business type: ${selectedBusinessData.businessType || "Business"}.
Website: ${selectedBusinessData.websiteUrl || "Not provided"}.

Rules:
${businessRules}

Strict information rules:
- Use only the verified business knowledge supplied below for business-specific facts.
- Never invent prices, products, opening hours, addresses, contact details, policies, or services.
- If the stored knowledge does not confirm an answer, clearly say that you do not have confirmed information.
- Do not claim to accept orders, process payments, or check live availability unless connected to those systems.
- Keep replies friendly and concise.

Business knowledge (JSON):
${knowledgeContext}
`.trim();


  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        stream: false,
        options: {
          temperature: 0
        }
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Ollama API error:",
        response.status,
        errorText
      );

      return res.status(503).json({
        success: false,
        message:
          "The AI assistant is temporarily unavailable. Please try again shortly."
      });
    }

    const data = await response.json();
    const reply = data.message?.content?.trim();

    if (!reply) {
      throw new Error("Ollama returned an empty reply.");
    }

    return res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("Chatbot AI error:", error.message);

    return res.status(503).json({
      success: false,
      message:
        "The AI assistant is temporarily unavailable. Check that Ollama is running and the model is installed."
    });
  }
});

// Basic public-IP check for the local crawler prototype.
// This is not a complete production SSRF defense.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);

    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    );
  }

  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();

    if (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe80:")
    ) {
      return true;
    }

    // Block IPv4-mapped IPv6 addresses in this prototype.
    if (value.startsWith("::ffff:")) {
      return true;
    }

    return false;
  }

  return true;
}

async function validatePublicWebsiteUrl(input) {
  let url;

  try {
    url = new URL(input);
  } catch {
    throw new Error("Please provide a valid website URL.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Only public HTTP or HTTPS URLs are allowed.");
  }

  if (!["", "80", "443"].includes(url.port)) {
    throw new Error("Custom ports are not allowed.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local addresses cannot be crawled.");
  }

  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true });

  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new Error("The URL must resolve to public IP addresses.");
  }

  return url;
}


 // Website crawler endpoint â€” JavaScript-rendered
app.post("/api/crawl", async (req, res) => {
  let browser;

  try {
    const { url } = req.body || {};

    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a website URL."
      });
    }

    let startUrl;

    try {
      startUrl = await validatePublicWebsiteUrl(url.trim());
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    const origin = startUrl.origin;
    const queue = [startUrl.href];
    const queued = new Set(queue);
    const visited = new Set();
    const pages = [];

    const maxPages = 10;
    const maxPageText = 20000;
    const maxQueuedUrls = 100;
    const pageTimeout = 15000;

    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      userAgent: "UniversalChatbotCrawler/1.0"
    });

    // Block non-document resources to reduce bandwidth and disk usage.
    await context.route("**/*", async (route) => {
      const request = route.request();

      if (
        request.isNavigationRequest() ||
        request.resourceType() === "document"
      ) {
        return route.continue();
      }

      return route.abort();
    });

    while (queue.length > 0 && pages.length < maxPages) {
      const currentUrl = queue.shift();
      queued.delete(currentUrl);

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      let page;

      try {
        const current = await validatePublicWebsiteUrl(currentUrl);

        if (current.origin !== origin) continue;

        page = await context.newPage();

        // Validate each redirect destination before allowing it.
        await page.route("**/*", async (route) => {
          const requestUrl = route.request().url();

          if (!["http:", "https:"].includes(new URL(requestUrl).protocol)) {
            return route.abort();
          }

          try {
            const checkedUrl = await validatePublicWebsiteUrl(requestUrl);

            if (checkedUrl.origin !== origin) {
              return route.abort();
            }

            return route.continue();
          } catch {
            return route.abort();
          }
        });

        const response = await page.goto(current.href, {
          waitUntil: "domcontentloaded",
          timeout: pageTimeout
        });

        if (!response || !response.ok()) continue;

        const finalUrl = new URL(page.url());

        if (finalUrl.origin !== origin) continue;

        const contentType =
          response.headers()["content-type"] || "";

        if (!contentType.toLowerCase().includes("text/html")) {
          continue;
        }

        // Give client-side rendering a short opportunity to finish.
        await page.waitForTimeout(1000);


const extracted = await page.evaluate(() => {
  const title = document.title || "";

  // Read structured data BEFORE removing scripts.
  const structuredData = [];

  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((script) => {
      try {
        structuredData.push(JSON.parse(script.textContent || ""));
      } catch {
        // Ignore invalid JSON-LD.
      }
    });

  // Read useful metadata.
  const metadata = Array.from(
    document.querySelectorAll("meta[property], meta[name]")
  )
    .map((meta) => ({
      name: meta.getAttribute("property") || meta.getAttribute("name"),
      content: meta.getAttribute("content") || ""
    }))
    .filter((item) => item.content.trim());

  // Extract common product fields from JSON-LD.
  const products = [];
  const seenProducts = new Set();

  function addProduct(product) {
    if (!product || typeof product !== "object") return;

    const name =
      typeof product.name === "string" ? product.name.trim() : "";

    if (!name) return;

    const offers = Array.isArray(product.offers)
      ? product.offers[0]
      : product.offers;

    const rawPrice = offers?.price ?? offers?.lowPrice ?? null;
    const price =
      rawPrice !== null &&
      rawPrice !== "" &&
      Number.isFinite(Number(rawPrice))
        ? Number(rawPrice)
        : null;

    const productUrl =
  typeof product.url === "string" && product.url
    ? product.url
    : typeof product["@id"] === "string" && product["@id"]
      ? product["@id"]
      : window.location.href;

    const key = `${name.toLowerCase()}|${productUrl}`;

    if (seenProducts.has(key)) return;
    seenProducts.add(key);

    products.push({
      name,
      description:
        typeof product.description === "string"
          ? product.description.trim()
          : "",
      price,
      currency:
        typeof offers?.priceCurrency === "string"
          ? offers.priceCurrency
          : null,
      url: productUrl,
      availability:
        typeof offers?.availability === "string"
          ? offers.availability.split("/").pop()
          : null,
      source: "json-ld"
    });
  }

  function inspectStructuredData(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(inspectStructuredData);
      return;
    }

    if (typeof value !== "object") return;

    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];

    if (types.includes("Product")) {
      addProduct(value);
    }

    if (value["@graph"]) {
      inspectStructuredData(value["@graph"]);
    }

    // Also inspect products nested in lists.
    if (value.itemListElement) {
      inspectStructuredData(value.itemListElement);
    }

    if (value.item && typeof value.item === "object") {
      inspectStructuredData(value.item);
    }
  }

  structuredData.forEach(inspectStructuredData);

  // Read common microdata product markup as a fallback.
  document.querySelectorAll('[itemtype*="schema.org/Product"]')
    .forEach((element) => {
      const readProperty = (property) => {
        const node = element.querySelector(`[itemprop="${property}"]`);
        return (
          node?.getAttribute("content") ||
          node?.getAttribute("href") ||
          node?.getAttribute("src") ||
          node?.innerText ||
          ""
        ).trim();
      };

      const name = readProperty("name");

      if (!name) return;

      const rawPrice =
        readProperty("price") ||
        element.querySelector('[itemprop="offers"] [itemprop="price"]')
          ?.getAttribute("content") ||
        "";

      const price =
        rawPrice !== "" && Number.isFinite(Number(rawPrice))
          ? Number(rawPrice)
          : null;

      const url = readProperty("url");
      const key = `${name.toLowerCase()}|${url}`;

      if (seenProducts.has(key)) return;
      seenProducts.add(key);

      products.push({
        name,
        description: readProperty("description"),
        price,
        currency: readProperty("priceCurrency") || null,
        url,
        availability: readProperty("availability") || null,
        source: "microdata"
      });
    });



  // Extract product cards from listing pages.
  document.querySelectorAll("a.card[href]").forEach((card) => {
    const name =
      card.querySelector("h3")?.innerText?.trim() || "";

    const priceText =
      card.querySelector("p")?.innerText?.trim() || "";

    if (!name) return;

    const priceMatch = priceText.match(
      /([$â‚¹â‚¬Â£])\s*([\d,]+(?:\.\d{1,2})?)/
    );

    const price = priceMatch
      ? Number(priceMatch[2].replace(/,/g, ""))
      : null;

    const currency = priceMatch
      ? ({
          "$": "USD",
          "â‚¹": "INR",
          "â‚¬": "EUR",
          "Â£": "GBP"
        })[priceMatch[1]]
      : null;

    const url = card.href;
    const key = `${name.toLowerCase()}|${url}`;

    if (seenProducts.has(key)) return;
    seenProducts.add(key);

    // Avoid adding a product-card duplicate when JSON-LD
    // already identifies the same product on this page.
    const mainProductExists = products.some((product) => {
      const sameName =
        product.name?.trim().toLowerCase() ===
        name.toLowerCase();

      const sameUrl =
        product.url &&
        new URL(product.url, window.location.href).href === url;

      return sameName || sameUrl;
    });

    if (mainProductExists) return;

    products.push({
      name,
      description: "",
      price,
      currency,
      url,
      availability: null,
      source: "product-card"
    });
  });


  const text = document.body?.innerText || "";

  const links = Array.from(
    document.querySelectorAll("a[href]")
  ).map((anchor) => anchor.href);

  return { title, text, links, products, metadata };
});

        pages.push({
          url: finalUrl.href,
          title: extracted.title.trim(),
          text: extracted.text.replace(/\s+/g, " ").trim()
            .slice(0, maxPageText),
          products: extracted.products,
          metadata: extracted.metadata
        });

        for (const href of extracted.links) {
          if (visited.size + queue.length >= maxQueuedUrls) break;

          try {
            const link = new URL(href);

            if (
              link.origin !== origin ||
              !["http:", "https:"].includes(link.protocol) ||
              !["", "80", "443"].includes(link.port)
            ) {
              continue;
            }

            link.hash = "";

            if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3)$/i.test(link.pathname)) {
              continue;
            }

            const nextUrl = link.href;

            if (!visited.has(nextUrl) && !queued.has(nextUrl)) {
              queue.push(nextUrl);
              queued.add(nextUrl);
            }
          } catch {
            // Ignore malformed links.
          }
        }
      } catch (error) {
        console.log("Crawler skipped a page:", currentUrl, error.message);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }


const storageDir = path.join(__dirname, "crawled-data");

fs.mkdirSync(storageDir, { recursive: true });

const safeWebsiteId = String(
  req.body.websiteId || "test-website"
).replace(/[^a-zA-Z0-9_-]/g, "_");

const storageFile = path.join(
  storageDir,
  `${safeWebsiteId}.json`
);

const crawlData = {
  websiteId: safeWebsiteId,
  startingUrl: startUrl.href,
  crawledAt: new Date().toISOString(),
  pagesFound: pages.length,
  pages
};

fs.writeFileSync(
  storageFile,
  JSON.stringify(crawlData, null, 2),
  "utf8"
);

return res.json({
  success: true,
  startingUrl: startUrl.href,
  pagesFound: pages.length,
  savedTo: storageFile,
  pages
});

  } catch (error) {
    console.error("Website crawler error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Website crawling failed."
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});


// Handle invalid JSON requests
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body."
    });
  }

  console.error("Server error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred."
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Universal Chatbot API running at http://localhost:${PORT}`
    );
    console.log(`Business loaded: ${businessData.businessName}`);
    console.log(`Ollama model: ${MODEL_NAME}`);
    console.log(
      "Food products loaded:",
      foodData.verifiedProducts?.length ?? 0
    );

    console.log(
      "Native Grocers products loaded:",
      nativeGrocersData.verifiedProducts?.length ?? 0
    );
  });
}

module.exports = {
  app,
  normalizeText,
  getMissingInformationReply,
  findCatalogMatchesByQuery,
  getVendorContext,
  findCrawledProductPrice
};
