// =============================================================================
// Tablecast — AI Shared Helpers: Image Generation
// DALL-E 3 image generation via OpenAI API
// =============================================================================
"use strict";

const logger = require("../../utils/logger");

/**
 * Style descriptors that are prepended to DALL-E prompts.
 */
const STYLE_MAP = {
  photorealistic: "Photorealistic style, highly detailed, lifelike: ",
  painted: "Painted in the style of a fantasy oil painting, rich colors, brushwork texture: ",
  sketch: "Sketch and line-art style, monochrome pencil drawing with fine details: ",
  comic: "Comic book illustration style, bold outlines, vibrant colors, cel-shaded: ",
  "fantasy-art": "Epic fantasy art style, dramatic lighting, sweeping composition: ",
};

/**
 * Generate an image using OpenAI DALL-E 3.
 *
 * @param {string} prompt      - The text description of the image to generate.
 * @param {string} [style]     - Optional style key (photorealistic, painted, sketch, comic, fantasy-art).
 * @param {string} apiKey      - OpenAI API key.
 * @returns {Promise<string>}  - The URL of the generated image.
 */
async function generateImage(prompt, style, apiKey) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Image prompt is required.");
  }
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("OpenAI API key is required for image generation.");
  }

  const stylePrefix = STYLE_MAP[style] || "";
  const fullPrompt = stylePrefix + prompt.trim();

  logger.info("ai:image", "Generating image via DALL-E 3", {
    style: style || "none",
    promptLength: fullPrompt.length,
  });

  const body = {
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    response_format: "url",
  };

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    logger.error("ai:image", "Network error calling DALL-E API", {
      error: networkErr.message,
    });
    throw new Error(`Failed to reach OpenAI API: ${networkErr.message}`);
  }

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      errorBody = "(unable to read error body)";
    }
    logger.error("ai:image", "DALL-E API returned error", {
      status: response.status,
      body: errorBody.substring(0, 500),
    });
    const msg = `OpenAI API error (${response.status}): ${errorBody.substring(0, 200)}`;
    throw new Error(msg);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    logger.error("ai:image", "Failed to parse DALL-E response", {
      error: parseErr.message,
    });
    throw new Error("Failed to parse the image generation response.");
  }

  if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    logger.error("ai:image", "DALL-E returned empty data array", {
      raw: JSON.stringify(data).substring(0, 500),
    });
    throw new Error("Image generation returned no results.");
  }

  const imageUrl = data.data[0].url;
  if (!imageUrl) {
    logger.error("ai:image", "DALL-E response missing url field", {
      firstItem: JSON.stringify(data.data[0]).substring(0, 300),
    });
    throw new Error("Image generation response did not contain a URL.");
  }

  logger.info("ai:image", "Image generated successfully", {
    urlLength: imageUrl.length,
  });

  return imageUrl;
}

module.exports = { generateImage };
