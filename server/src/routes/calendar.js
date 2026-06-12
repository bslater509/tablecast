// =============================================================================
// Tablecast  Calendar & Weather Routes
// Endpoints:  GET    /api/calendar             — Get calendar config + weather (public)
//             PUT    /api/calendar             — Update calendar config (DM only)
//             POST   /api/calendar/advance     — Advance time by days/timeOfDay (DM only)
//             POST   /api/calendar/weather     — Generate new weather (DM only)
// =============================================================================
"use strict";

const { Router } = require("express");
const prisma = require("../prisma");
const { requireDm } = require("../auth");
const logger = require("../utils/logger");
const { generateWeather } = require("../utils/weatherGenerator");

const router = Router();

const CALENDAR_CONFIG_KEY = "calendar.config";

const DEFAULT_CONFIG = {
  currentDate: { year: 1495, month: 1, day: 1 },
  timeOfDay: "morning",
  dayLength: "standard",
  monthNames: [
    "Hammer", "Alturiak", "Ches", "Tarsakh", "Mirtul", "Kythorn",
    "Flamerule", "Eleasis", "Eleint", "Marpenoth", "Uktar", "Nightal",
  ],
  dayNames: [
    "Starday", "Sunday", "Moonday", "Tarsday", "Waterday", "Washeday", "Highsun",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCalendarConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALENDAR_CONFIG_KEY },
  });

  if (!setting) {
    // Initialize with defaults + generate weather
    const config = {
      ...DEFAULT_CONFIG,
      currentWeather: generateWeather(DEFAULT_CONFIG.currentDate.month, "plains"),
    };
    await prisma.appSetting.create({
      data: {
        key: CALENDAR_CONFIG_KEY,
        value: JSON.stringify(config),
      },
    });
    return config;
  }

  try {
    return JSON.parse(setting.value);
  } catch {
    // Corrupted config — reset to defaults
    const config = {
      ...DEFAULT_CONFIG,
      currentWeather: generateWeather(DEFAULT_CONFIG.currentDate.month, "plains"),
    };
    await prisma.appSetting.update({
      where: { key: CALENDAR_CONFIG_KEY },
      data: { value: JSON.stringify(config) },
    });
    return config;
  }
}

async function saveCalendarConfig(config) {
  await prisma.appSetting.upsert({
    where: { key: CALENDAR_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: CALENDAR_CONFIG_KEY, value: JSON.stringify(config) },
  });
}

function getDaysInMonth(month, year) {
  // Generic month lengths for a fantasy calendar (all months 30 days)
  // or handle special cases for leap years etc.
  return 30;
}

// ---------------------------------------------------------------------------
// GET /api/calendar  Get calendar config + weather (public — players can see)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const config = await getCalendarConfig();
    res.json(config);
  } catch (err) {
    logger.error("api:calendar", "Error fetching calendar config", { error: err.message });
    res.status(500).json({ error: "Failed to fetch calendar config." });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/calendar  Update calendar config (DM only)
// ---------------------------------------------------------------------------
router.put("/", requireDm, async (req, res) => {
  try {
    const config = await getCalendarConfig();

    // Update month names if provided
    if (req.body.monthNames !== undefined) {
      if (!Array.isArray(req.body.monthNames) || req.body.monthNames.length !== 12) {
        return res.status(400).json({ error: "monthNames must be an array of 12 strings." });
      }
      config.monthNames = req.body.monthNames;
    }

    // Update day names if provided
    if (req.body.dayNames !== undefined) {
      if (!Array.isArray(req.body.dayNames) || req.body.dayNames.length !== 7) {
        return res.status(400).json({ error: "dayNames must be an array of 7 strings." });
      }
      config.dayNames = req.body.dayNames;
    }

    // Update day length if provided
    if (req.body.dayLength !== undefined) {
      const valid = ["standard", "long", "short"];
      if (!valid.includes(req.body.dayLength)) {
        return res.status(400).json({ error: "dayLength must be standard, long, or short." });
      }
      config.dayLength = req.body.dayLength;
    }

    // Update time of day if provided
    if (req.body.timeOfDay !== undefined) {
      const valid = ["dawn", "morning", "afternoon", "dusk", "night"];
      if (!valid.includes(req.body.timeOfDay)) {
        return res.status(400).json({ error: "timeOfDay must be dawn, morning, afternoon, dusk, or night." });
      }
      config.timeOfDay = req.body.timeOfDay;
    }

    // Set date directly if provided
    if (req.body.currentDate !== undefined) {
      const { year, month, day } = req.body.currentDate;
      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return res.status(400).json({ error: "currentDate must have year, month, and day as integers." });
      }
      if (month < 1 || month > 12) {
        return res.status(400).json({ error: "month must be between 1 and 12." });
      }
      if (day < 1 || day > getDaysInMonth(month, year)) {
        return res.status(400).json({ error: "day out of range for the given month." });
      }
      config.currentDate = { year, month, day };

      // Re-generate weather when date changes significantly
      if (req.body.regenerateWeather !== false) {
        const terrain = config.currentWeather?.terrain || "plains";
        config.currentWeather = generateWeather(month, terrain);
      }
    }

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = req.app.get("io");
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      logger.warn("api:calendar", "Failed to emit socket event", { error: socketErr.message });
    }

    logger.info("api:calendar", "Calendar config updated");
    res.json(config);
  } catch (err) {
    logger.error("api:calendar", "Error updating calendar config", { error: err.message });
    res.status(500).json({ error: "Failed to update calendar config." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/calendar/advance  Advance time (DM only)
// ---------------------------------------------------------------------------
router.post("/advance", requireDm, async (req, res) => {
  try {
    const { days = 1, timeOfDay } = req.body;

    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return res.status(400).json({ error: "days must be an integer between 0 and 365." });
    }

    const config = await getCalendarConfig();
    const { year, month, day } = config.currentDate;

    let newDay = day + days;
    let newMonth = month;
    let newYear = year;

    // Advance month(s) if day exceeds month length
    while (newDay > getDaysInMonth(newMonth, newYear)) {
      newDay -= getDaysInMonth(newMonth, newYear);
      newMonth++;
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      }
    }

    config.currentDate = { year: newYear, month: newMonth, day: newDay };

    if (timeOfDay !== undefined) {
      const valid = ["dawn", "morning", "afternoon", "dusk", "night"];
      if (!valid.includes(timeOfDay)) {
        return res.status(400).json({ error: "timeOfDay must be dawn, morning, afternoon, dusk, or night." });
      }
      config.timeOfDay = timeOfDay;
    }

    // Generate new weather when days advance
    const terrain = config.currentWeather?.terrain || "plains";
    config.currentWeather = generateWeather(newMonth, terrain);

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = req.app.get("io");
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      logger.warn("api:calendar", "Failed to emit socket event", { error: socketErr.message });
    }

    logger.info("api:calendar", "Calendar advanced", { days, newDate: config.currentDate });
    res.json(config);
  } catch (err) {
    logger.error("api:calendar", "Error advancing calendar", { error: err.message });
    res.status(500).json({ error: "Failed to advance calendar." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/calendar/weather  Generate new weather (DM only)
// ---------------------------------------------------------------------------
router.post("/weather", requireDm, async (req, res) => {
  try {
    const config = await getCalendarConfig();
    const {month} = config.currentDate;
    const terrain = req.body.terrain || config.currentWeather?.terrain || "plains";

    const validTerrains = ["desert", "forest", "mountains", "plains", "coastal", "swamp", "arctic", "urban", "underground"];
    if (terrain && !validTerrains.includes(terrain)) {
      return res.status(400).json({
        error: `Invalid terrain. Must be one of: ${validTerrains.join(", ")}`,
      });
    }

    config.currentWeather = generateWeather(month, terrain);

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = req.app.get("io");
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      logger.warn("api:calendar", "Failed to emit socket event", { error: socketErr.message });
    }

    logger.info("api:calendar", "Weather regenerated", { terrain, weather: config.currentWeather.weather });
    res.json(config);
  } catch (err) {
    logger.error("api:calendar", "Error generating weather", { error: err.message });
    res.status(500).json({ error: "Failed to generate weather." });
  }
});

module.exports = router;
