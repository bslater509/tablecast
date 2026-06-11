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
  let remaining = amountInCp;
  let totalCp = totalGold(currency);
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

  return { pp, gp, ep, sp, cp: cp };
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
    const { name, location, shopType, markupMultiplier } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const shop = await prisma.shop.create({
      data: {
        name: name.trim(),
        location: location || "",
        shopType: shopType || "GENERAL",
        markupMultiplier: markupMultiplier !== undefined ? Number(markupMultiplier) : 1.0,
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

    const { name, location, shopType, markupMultiplier } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (location !== undefined) data.location = location;
    if (shopType !== undefined) data.shopType = shopType;
    if (markupMultiplier !== undefined) data.markupMultiplier = Number(markupMultiplier);

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

    const { name, price, quantity, isMagic, attunementRequired, description } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name (string) is required." });
    }

    const item = await prisma.shopItem.create({
      data: {
        shopId,
        name: name.trim(),
        price: price !== undefined ? Number(price) : 0,
        quantity: quantity !== undefined ? Number(quantity) : 1,
        isMagic: isMagic || false,
        attunementRequired: attunementRequired || false,
        description: description || "",
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

    const { name, price, quantity, isMagic, attunementRequired, description } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (price !== undefined) data.price = Number(price);
    if (quantity !== undefined) data.quantity = Number(quantity);
    if (isMagic !== undefined) data.isMagic = isMagic;
    if (attunementRequired !== undefined) data.attunementRequired = attunementRequired;
    if (description !== undefined) data.description = description;

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
    const totalPriceCp = item.price * 100 * buyQty * shop.markupMultiplier;
    const currency = parseCurrency(character.currency);
    const newCurrency = deductCurrency(currency, totalPriceCp);
    if (!newCurrency) {
      return res.status(400).json({ error: "Not enough gold." });
    }

    const inventory = JSON.parse(character.inventory || "[]");
    const existingItem = inventory.find(
      (inv) => inv.name === item.name && inv.isMagic === item.isMagic
    );
    if (existingItem) {
      existingItem.quantity = (existingItem.quantity || 1) + buyQty;
    } else {
      inventory.push({
        name: item.name,
        quantity: buyQty,
        description: item.description,
        isMagic: item.isMagic,
        attunementRequired: item.attunementRequired,
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
      message: `Purchased ${buyQty}x ${item.name} for ${(totalPriceCp / 100).toFixed(2)} gp.`,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/buy", { error: err.message });
    res.status(500).json({ error: "Failed to buy item." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/shops/:id/sell  sell item to shop
// Body: { characterId, itemId, inventoryItemIndex, quantity, dmApproved? }
// ---------------------------------------------------------------------------
router.post("/:id/sell", async (req, res) => {
  try {
    const shopId = Number(req.params.id);
    if (isNaN(shopId)) {
      return res.status(400).json({ error: "id must be a valid number." });
    }

    const { characterId, itemId, inventoryItemIndex, quantity, dmApproved } = req.body;
    if (characterId === undefined || inventoryItemIndex === undefined) {
      return res.status(400).json({ error: "characterId and inventoryItemIndex are required." });
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
    if (inventoryItemIndex < 0 || inventoryItemIndex >= inventory.length) {
      return res.status(400).json({ error: "Invalid inventory item index." });
    }

    const invItem = inventory[inventoryItemIndex];
    if (invItem.quantity < sellQty) {
      return res.status(400).json({ error: "Not enough of this item in inventory." });
    }

    const itemPrice = itemId
      ? (await prisma.shopItem.findUnique({ where: { id: Number(itemId) } }))?.price || 10
      : 10;

    // Sell price is half of base price (in cp, then halved)
    const totalPriceCp = Math.floor((itemPrice * 100 * sellQty * shop.markupMultiplier) / 2);
    const currency = parseCurrency(character.currency);
    const newCurrency = addCurrency(currency, totalPriceCp);

    // Remove from inventory
    if (invItem.quantity <= sellQty) {
      inventory.splice(inventoryItemIndex, 1);
    } else {
      invItem.quantity -= sellQty;
    }

    // Update shop stock if itemId provided
    if (itemId) {
      const shopItem = await prisma.shopItem.findUnique({ where: { id: Number(itemId) } });
      if (shopItem && shopItem.quantity !== -1) {
        await prisma.shopItem.update({
          where: { id: Number(itemId) },
          data: { quantity: shopItem.quantity + sellQty },
        });
      }
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
      characterId,
      inventoryItemIndex,
      sellQty,
      totalPriceCp,
    });

    res.json({
      character: { id: updatedChar.id, currency: updatedChar.currency, inventory: updatedChar.inventory },
      message: `Sold ${sellQty}x ${invItem.name} for ${(totalPriceCp / 100).toFixed(2)} gp.`,
    });
  } catch (err) {
    logger.error("api:route", "Error in POST /api/shops/:id/sell", { error: err.message });
    res.status(500).json({ error: "Failed to sell item." });
  }
});

module.exports = router;
