// =============================================================================
// Tablecast MCP — Calendar & Weather Tool Handlers
// =============================================================================
"use strict";

const prisma = require("../../prisma");
const { generateWeather } = require("../../utils/weatherGenerator");

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

async function getCalendarConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: CALENDAR_CONFIG_KEY },
  });

  if (!setting) {
    const config = {
      ...DEFAULT_CONFIG,
      currentWeather: generateWeather(DEFAULT_CONFIG.currentDate.month, "plains"),
    };
    await prisma.appSetting.create({
      data: { key: CALENDAR_CONFIG_KEY, value: JSON.stringify(config) },
    });
    return config;
  }

  try {
    return JSON.parse(setting.value);
  } catch {
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

function getDaysInMonth(_month, _year) {
  return 30;
}

// ---------------------------------------------------------------------------
// Handler: get_calendar
// ---------------------------------------------------------------------------
async function handleGetCalendar(args, context) {
  try {
    const config = await getCalendarConfig();
    return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
  } catch (err) {
    context.logError("Error getting calendar:", err.message);
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// Handler: update_calendar
// ---------------------------------------------------------------------------
async function handleUpdateCalendar(args, context) {
  try {
    const config = await getCalendarConfig();

    if (args.monthNames !== undefined) {
      if (!Array.isArray(args.monthNames) || args.monthNames.length !== 12) {
        throw new Error("monthNames must be an array of 12 strings.");
      }
      config.monthNames = args.monthNames;
    }

    if (args.dayNames !== undefined) {
      if (!Array.isArray(args.dayNames) || args.dayNames.length !== 7) {
        throw new Error("dayNames must be an array of 7 strings.");
      }
      config.dayNames = args.dayNames;
    }

    if (args.dayLength !== undefined) {
      const valid = ["standard", "long", "short"];
      if (!valid.includes(args.dayLength)) {
        throw new Error("dayLength must be standard, long, or short.");
      }
      config.dayLength = args.dayLength;
    }

    if (args.timeOfDay !== undefined) {
      const valid = ["dawn", "morning", "afternoon", "dusk", "night"];
      if (!valid.includes(args.timeOfDay)) {
        throw new Error("timeOfDay must be dawn, morning, afternoon, dusk, or night.");
      }
      config.timeOfDay = args.timeOfDay;
    }

    if (args.currentDate !== undefined) {
      const { year, month, day } = args.currentDate;
      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new Error("currentDate must have year, month, and day as integers.");
      }
      if (month < 1 || month > 12) {
        throw new Error("month must be between 1 and 12.");
      }
      if (day < 1 || day > getDaysInMonth(month, year)) {
        throw new Error("day out of range for the given month.");
      }
      config.currentDate = { year, month, day };

      const terrain = config.currentWeather?.terrain || "plains";
      config.currentWeather = generateWeather(month, terrain);
    }

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = context.getIo();
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      context.logError("Failed to emit socket event:", socketErr.message);
    }

    return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
  } catch (err) {
    context.logError("Error updating calendar:", err.message);
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// Handler: advance_calendar
// ---------------------------------------------------------------------------
async function handleAdvanceCalendar(args, context) {
  try {
    const days = args.days !== undefined ? args.days : 1;
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw new Error("days must be an integer between 0 and 365.");
    }

    const config = await getCalendarConfig();
    const { year, month, day } = config.currentDate;

    let newDay = day + days;
    let newMonth = month;
    let newYear = year;

    while (newDay > getDaysInMonth(newMonth, newYear)) {
      newDay -= getDaysInMonth(newMonth, newYear);
      newMonth++;
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      }
    }

    config.currentDate = { year: newYear, month: newMonth, day: newDay };

    if (args.timeOfDay !== undefined) {
      const valid = ["dawn", "morning", "afternoon", "dusk", "night"];
      if (!valid.includes(args.timeOfDay)) {
        throw new Error("timeOfDay must be dawn, morning, afternoon, dusk, or night.");
      }
      config.timeOfDay = args.timeOfDay;
    }

    const terrain = config.currentWeather?.terrain || "plains";
    config.currentWeather = generateWeather(newMonth, terrain);

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = context.getIo();
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      context.logError("Failed to emit socket event:", socketErr.message);
    }

    return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
  } catch (err) {
    context.logError("Error advancing calendar:", err.message);
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// Handler: generate_weather
// ---------------------------------------------------------------------------
async function handleGenerateWeather(args, context) {
  try {
    const config = await getCalendarConfig();
    const {month} = config.currentDate;
    const terrain = args.terrain || config.currentWeather?.terrain || "plains";

    const validTerrains = ["desert", "forest", "mountains", "plains", "coastal", "swamp", "arctic", "urban", "underground"];
    if (!validTerrains.includes(terrain)) {
      throw new Error(`Invalid terrain. Must be one of: ${validTerrains.join(", ")}`);
    }

    config.currentWeather = generateWeather(month, terrain);

    await saveCalendarConfig(config);

    // Emit socket event for real-time sync
    try {
      const io = context.getIo();
      if (io) {
        io.emit("game:dateChange", { calendar: config });
      }
    } catch (socketErr) {
      context.logError("Failed to emit socket event:", socketErr.message);
    }

    return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
  } catch (err) {
    context.logError("Error generating weather:", err.message);
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}

module.exports = {
  handleGetCalendar,
  handleUpdateCalendar,
  handleAdvanceCalendar,
  handleGenerateWeather,
};
