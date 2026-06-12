// =============================================================================
// Tablecast  Shop & Economy Routes
// Endpoints:  CRUD for shops, shop items, buy/sell mechanics
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { getRequestUser, requireDm } = require("../auth");
const logger = require("../utils/logger");

const router = Router();

function parseCurrency(currencyStr) {
  try {
    return JSON.parse(currencyStr || '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}');
  } catch {
    return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  }
}

function totalGold(currency) {
  return (currency.pp || 0) * 1000 +
    (currency.gp || 0) * 100 +
    (currency.ep || 0) * 50 +
    (currency.sp || 0) * 10 +
    (currency.cp || 0);
}

function deductCurrency(currency, amountInCp) {
  const remaining = amountInCp;
  const totalCp = totalGold(currency);
  if (totalCp < remaining) return null;

  // Convert everything to cp
  let cp = (currency.pp || 0) * 1000 +
    (currency.gp || 0) * 100 +
    (currency.ep || 0) * 50 +
    (currency.sp || 0) * 10 +
    (currency.cp || 0);

  cp -= remaining;
  if (cp < 0) return null;

  // Convert back to standard denominations
  const pp = Math.floor(cp / 1000);
  cp %= 1000;
  const gp = Math.floor(cp / 100);
  cp %= 100;
  const ep = Math.floor(cp / 50);
  cp %= 50;
  const sp = Math.floor(cp / 10);
  cp %= 10;

  return { pp, gp, ep, sp, cp };
}

function addCurrency(currency, amountInCp) {
  let cp = (currency.pp || 0) * 1000 +
    (currency.gp || 0) * 100 +
    (currency.ep || 0) * 50 +
    (currency.sp || 0) * 10 +
    (currency.cp || 0);
  cp += amountInCp;

  const pp = Math.floor(cp / 1000);
  cp %= 1000;
  const gp = Math.floor(cp / 100);
  cp %= 100;
  const ep = Math.floor(cp / 50);
  cp %= 50;
  const sp = Math.floor(cp / 10);
  cp %= 10;

  return { pp, gp, ep, sp, cp };
}

// ---------------------------------------------------------------------------
// POST /api/shops  create a shop (DM only)
// ---------------------------------------------------------------------------
router.post("/", requireDm, async (req, res) => {
  try {
    const { name, description, markup, isActive } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const shop = await prisma.shop.create({
      data: {
        name: name.trim(),
        description: description || "",
        markup: markup !== undefined ? Number(markup) : 1.0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
      include: { items: true },
    });

    logger.info("api:route", "Shop created", { shopId: shop.id, name: shop.name });
    res.status(201).json(shop);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops", { error: err.message });
    res.status(500).json({ error: "Failed to create shop." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/shops  list all shops
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      include: { items: true },
      orderBy: { name: "asc" },
    });
    res.json(shops);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/shops", { error: err.message });
    res.status(500).json({ error: "Failed to fetch shops." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/shops/:id  get a shop with items
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const shop = await prisma.shop.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    res.json(shop);
  } catch (err) {
    logger.error("api:route", "Error in GET /api/shops/:id", { error: err.message });
    res.status(500).json({ error: "Failed to fetch shop." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/shops/:id  update shop details (DM only)
// ---------------------------------------------------------------------------
router.put("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const { name, description, markup, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description;
    if (markup !== undefined) data.markup = Number(markup);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const shop = await prisma.shop.update({
      where: { id },
      data,
      include: { items: true },
    });

    res.json(shop);
  } catch (err) {
    logger.error("api:route", "Error in PUT /api/shops/:id", { error: err.message });
    res.status(500).json({ error: "Failed to update shop." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/shops/:id  delete shop (DM only)
// ---------------------------------------------------------------------------
router.delete("/:id", requireDm, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const existing = await prisma.shop.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Shop not found." });
    }

    await prisma.shop.delete({ where: { id } });
    res.json({ message: "Shop deleted." });
  } catch (err) {
    logger.error("api:route", "Error in DELETE /api/shops/:id", { error: err.message });
    res.status(500).json({ error: "Failed to delete shop." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/items  add item to shop (DM only)
// ---------------------------------------------------------------------------
router.post("/:id/items", requireDm, async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const { name, price, quantity, isMagical, attunement, description, category, tags } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const item = await prisma.shopItem.create({
      data: {
        shopId,
        name: name.trim(),
        price: price !== undefined ? Number(price) : 0,
        quantity: quantity !== undefined ? Number(quantity) : 1,
        isMagical: isMagical || false,
        attunement: attunement || false,
        description: description || "",
        category: category || "",
        tags: tags || "[]",
      },
    });

    res.status(201).json(item);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/items", { error: err.message });
    res.status(500).json({ error: "Failed to add item." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/shops/items/:itemId  update shop item
// ---------------------------------------------------------------------------
router.put("/items/:itemId", requireDm, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "itemId must be a valid number." });
    }

    const existing = await prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({ error: "Shop item not found." });
    }

    const { name, price, quantity, isMagical, attunement, description, category, tags } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (price !== undefined) data.price = Number(price);
    if (quantity !== undefined) data.quantity = Number(quantity);
    if (isMagical !== undefined) data.isMagical = isMagical;
    if (attunement !== undefined) data.attunement = attunement;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = tags;

    const item = await prisma.shopItem.update({
      where: { id: itemId },
      data,
    });

    res.json(item);
  } catch (err) {
    logger.error("api:route", "Error in PUT /api/shops/items/:itemId", { error: err.message });
    res.status(500).json({ error: "Failed to update item." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/shops/items/:itemId  delete shop item
// ---------------------------------------------------------------------------
router.delete("/items/:itemId", requireDm, async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "itemId must be a valid number." });
    }

    const existing = await prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({ error: "Shop item not found." });
    }

    await prisma.shopItem.delete({ where: { id: itemId } });
    res.json({ message: "Shop item deleted." });
  } catch (err) {
    logger.error("api:route", "Error in DELETE /api/shops/items/:itemId", { error: err.message });
    res.status(500).json({ error: "Failed to delete item." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/buy  buy item from shop
// Body: { characterId, itemId, quantity }
// ---------------------------------------------------------------------------
router.post("/:id/buy", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { characterId, itemId, quantity } = req.body;
    if (!characterId || !itemId) {
      return res.status(400).json({ error: "characterId and itemId are required." });
    }

    const buyQty = quantity ? Math.max(1, Number(quantity)) : 1;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item || item.shopId !== shopId) {
      return res.status(404).json({ error: "Item not found in this shop." });
    }

    if (item.quantity < buyQty && item.quantity !== -1) {
      return res.status(400).json({ error: `Not enough stock. Available: ${item.quantity}` });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    // Calculate total price in cp (item price is in gp, convert to cp)
    const totalPriceCp = item.price * 100 * buyQty * shop.markup;
    const currency = parseCurrency(character.currency);
    const newCurrency = deductCurrency(currency, totalPriceCp);
    if (!newCurrency) {
      return res.status(400).json({ error: "Not enough gold." });
    }

    const inventory = JSON.parse(character.inventory || "[]");
    const existingItemIdx = inventory.findIndex(
      (inv) => inv.name === item.name
    );
    if (existingItemIdx !== -1) {
      inventory[existingItemIdx].quantity = (inventory[existingItemIdx].quantity || 1) + buyQty;
    } else {
      inventory.push({
        name: item.name,
        quantity: buyQty,
        description: item.description,
        isMagical: item.isMagical,
        attunement: item.attunement,
      });
    }

    const [updatedChar] = await Promise.all([
      prisma.character.update({
        where: { id: characterId },
        data: {
          currency: JSON.stringify(newCurrency),
          inventory: JSON.stringify(inventory),
        },
      }),
      item.quantity !== -1
        ? prisma.shopItem.update({
            where: { id: itemId },
            data: { quantity: item.quantity - buyQty },
          })
        : Promise.resolve(),
    ]);

    // Fetch updated shop to include in response for frontend stock refresh
    const updatedShop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { items: true },
    });

    logger.info("api:route", "Item purchased", {
      shopId,
      itemId,
      characterId,
      buyQty,
      totalPriceCp,
    });

    res.json({
      character: {
        id: updatedChar.id,
        currency: JSON.stringify(newCurrency),
        inventory: JSON.stringify(inventory),
      },
      shop: updatedShop,
      message: `Purchased ${buyQty}x ${item.name} for ${(totalPriceCp / 100).toFixed(2)} gp.`,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/buy", { error: err.message });
    res.status(500).json({ error: "Failed to buy item." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/sell  sell item to shop
// Body: { characterId, itemName, quantity }
// ---------------------------------------------------------------------------
router.post("/:id/sell", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { characterId, itemName, quantity } = req.body;
    if (!characterId || !itemName) {
      return res.status(400).json({ error: "characterId and itemName are required." });
    }

    const sellQty = quantity ? Math.max(1, Number(quantity)) : 1;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    const inventory = JSON.parse(character.inventory || "[]");
    const invIndex = inventory.findIndex(
      (inv) => inv.name.toLowerCase() === itemName.toLowerCase()
    );
    if (invIndex === -1) {
      return res.status(400).json({ error: `Item "${itemName}" not found in inventory.` });
    }

    const invItem = inventory[invIndex];
    if (invItem.quantity < sellQty) {
      return res.status(400).json({ error: "Not enough of this item in inventory." });
    }

    // Find a matching shop item for price reference
    const shopItem = await prisma.shopItem.findFirst({
      where: { shopId, name: { contains: invItem.name } },
    });
    const itemPrice = shopItem?.price || 10;

    // Sell price is half of base price (in cp, then halved), adjusted by shop markup
    const totalPriceCp = Math.floor((itemPrice * 100 * sellQty * shop.markup) / 2);
    const currency = parseCurrency(character.currency);
    const newCurrency = addCurrency(currency, totalPriceCp);

    // Remove from inventory
    if (invItem.quantity <= sellQty) {
      inventory.splice(invIndex, 1);
    } else {
      invItem.quantity -= sellQty;
    }

    // Update shop stock if a matching item exists
    if (shopItem && shopItem.quantity !== -1) {
      await prisma.shopItem.update({
        where: { id: shopItem.id },
        data: { quantity: shopItem.quantity + sellQty },
      });
    }

    const updatedChar = await prisma.character.update({
      where: { id: characterId },
      data: {
        currency: JSON.stringify(newCurrency),
        inventory: JSON.stringify(inventory),
      },
    });

    logger.info("api:route", "Item sold", {
      shopId,
      itemName,
      characterId,
      sellQty,
      totalPriceCp,
    });

    // Fetch updated shop for frontend stock refresh
    const updatedShop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { items: true },
    });

    res.json({
      character: { id: updatedChar.id, currency: updatedChar.currency, inventory: updatedChar.inventory },
      shop: updatedShop,
      message: `Sold ${sellQty}x ${invItem.name} for ${(totalPriceCp / 100).toFixed(2)} gp.`,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/sell", { error: err.message });
    res.status(500).json({ error: "Failed to sell item." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/haggle  haggle on an item price
// Body: { itemId, characterId, persuasionRoll }
// ---------------------------------------------------------------------------
router.post("/:id/haggle", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { itemId, characterId, persuasionRoll } = req.body;
    if (!itemId || !characterId || persuasionRoll === undefined) {
      return res.status(400).json({ error: "itemId, characterId, and persuasionRoll are required." });
    }

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const item = await prisma.shopItem.findUnique({ where: { id: Number(itemId) } });
    if (!item || item.shopId !== shopId) {
      return res.status(404).json({ error: "Item not found in this shop." });
    }

    const roll = Number(persuasionRoll);
    const basePrice = item.price * 100; // price in cp

    // Persuasion DC: 10 = normal, harder for expensive items
    const dc = Math.min(20, Math.max(8, 10 + Math.floor(item.price / 50)));
    let discountPercent = 0;
    let flavor = "";

    if (roll >= dc + 5) {
      // Critical success: 20% discount
      discountPercent = 20;
      flavor = "The shopkeeper is impressed! They offer a significant discount.";
    } else if (roll >= dc) {
      // Success: 10% discount
      discountPercent = 10;
      flavor = "Your persuasion succeeds. The shopkeeper knocks off a bit.";
    } else if (roll >= dc - 3) {
      // Close: no change
      discountPercent = 0;
      flavor = "The shopkeeper considers it but holds firm on the price.";
    } else {
      // Failure: 10% markup (offended)
      discountPercent = -10;
      flavor = "The shopkeeper is offended by your haggling and raises the price.";
    }

    const originalPrice = Math.round(basePrice * shop.markup);
    const discountedPrice = Math.round(originalPrice * (1 + discountPercent / 100));

    const result = {
      itemId: item.id,
      itemName: item.name,
      originalPrice,
      discountedPrice,
      discountPercent,
      persuasionRoll: roll,
      dc,
      flavor,
      adjustedPrice: Math.max(0, discountedPrice),
    };

    logger.info("api:route", "Haggle attempted", {
      shopId,
      itemId,
      characterId,
      roll,
      dc,
      discountPercent,
    });

    res.json(result);
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/haggle", { error: err.message });
    res.status(500).json({ error: "Failed to haggle." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/buy-custom  buy at a custom (haggled) price
// Body: { characterId, itemId, customPriceCp, quantity }
// ---------------------------------------------------------------------------
router.post("/:id/buy-custom", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { characterId, itemId, customPriceCp, quantity } = req.body;
    if (!characterId || !itemId || customPriceCp === undefined) {
      return res.status(400).json({ error: "characterId, itemId, and customPriceCp are required." });
    }

    const buyQty = quantity ? Math.max(1, Number(quantity)) : 1;

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      return res.status(404).json({ error: "Shop not found." });
    }

    const item = await prisma.shopItem.findUnique({ where: { id: Number(itemId) } });
    if (!item || item.shopId !== shopId) {
      return res.status(404).json({ error: "Item not found in this shop." });
    }

    if (item.quantity < buyQty && item.quantity !== -1) {
      return res.status(400).json({ error: `Not enough stock. Available: ${item.quantity}` });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      return res.status(404).json({ error: "Character not found." });
    }

    const totalPriceCp = customPriceCp * buyQty;
    const currency = parseCurrency(character.currency);
    const newCurrency = deductCurrency(currency, totalPriceCp);
    if (!newCurrency) {
      return res.status(400).json({ error: "Not enough gold." });
    }

    const inventory = JSON.parse(character.inventory || "[]");
    const existingItem = inventory.find(
      (inv) => inv.name === item.name && inv.isMagical === item.isMagical
    );
    if (existingItem) {
      existingItem.quantity = (existingItem.quantity || 1) + buyQty;
    } else {
      inventory.push({
        name: item.name,
        quantity: buyQty,
        description: item.description,
        isMagical: item.isMagical,
        attunement: item.attunement,
      });
    }

    const [updatedChar] = await Promise.all([
      prisma.character.update({
        where: { id: characterId },
        data: {
          currency: JSON.stringify(newCurrency),
          inventory: JSON.stringify(inventory),
        },
      }),
      item.quantity !== -1
        ? prisma.shopItem.update({
            where: { id: itemId },
            data: { quantity: item.quantity - buyQty },
          })
        : Promise.resolve(),
    ]);

    logger.info("api:route", "Item purchased at custom price", {
      shopId,
      itemId,
      characterId,
      buyQty,
      totalPriceCp,
    });

    // Return updated shop data for UI refresh (SYNC-7)
    const updatedShop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { items: true },
    });

    res.json({
      character: {
        id: updatedChar.id,
        currency: JSON.stringify(newCurrency),
        inventory: JSON.stringify(inventory),
      },
      shop: updatedShop,
      message: `Purchased ${buyQty}x ${item.name} for ${(totalPriceCp / 100).toFixed(2)} gp.`,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/buy-custom", { error: err.message });
    res.status(500).json({ error: "Failed to complete purchase at custom price." });
  }
});

module.exports = router;
