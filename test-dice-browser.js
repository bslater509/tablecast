const puppeteer = require("puppeteer-core");

async function run() {
  console.log("Launching headless Google Chrome...");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();

  // Log browser console messages
  page.on("console", (msg) => {
    console.log(`[Browser Console ${msg.type()}]`, msg.text());
  });

  // Log page errors
  page.on("pageerror", (err) => {
    console.error("[Browser Error]", err.message);
  });

  // Log failed network requests
  page.on("requestfailed", (request) => {
    console.error(`[Network Fail] ${request.url()} - ${request.failure().errorText}`);
  });

  console.log("Navigating to http://192.168.0.77:3001 ...");
  await page.goto("http://192.168.0.77:3001", { waitUntil: "networkidle2" });

  console.log("Waiting 3 seconds for page to load...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Find any join button and click it
  console.log("Looking for user join buttons...");
  const buttons = await page.$$("button[id^='join-user-']");
  if (buttons.length > 0) {
    console.log(`Found ${buttons.length} users. Joining the first one...`);
    await buttons[0].click();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } else {
    console.log("No join buttons found. Attempting to create user...");
    // Just type a name and submit
    await page.type("#new-username-input", "TestAdventurer");
    await page.click("#join-tavern-btn");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Now we should be logged in. Let's find the chat input and trigger a roll
  console.log("Checking if we can type a roll in chat...");
  // Check if we are in chat tab or if we need to navigate. Let's send a roll via page.evaluate
  // or socket emit if exposed, or just type "/roll 1d20" in chat.
  // Let's type in the chat input if it exists
  const chatInput = await page.$("input[placeholder*='message']");
  if (chatInput) {
    console.log("Found chat input. Typing '/roll 1d20'...");
    await page.type("input[placeholder*='message']", "/roll 1d20");
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } else {
    console.log("Chat input not found. Attempting to trigger roll via window event or direct code...");
    // Let's evaluate window.dispatchEvent or socket event
    await page.evaluate(() => {
      // If there's a character roll button, let's click it, or trigger via socket
      console.log("Page context:", window.location.href);
    });
  }

  console.log("Waiting 5 seconds for roll animation to complete...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("Closing browser.");
  await browser.close();
}

run().catch((err) => {
  console.error("Test script failed:", err);
});
