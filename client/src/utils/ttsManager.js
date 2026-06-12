// =============================================================================
// Tablecast — TTS Manager (SpeechSynthesis Wrapper)
// Queue-based text-to-speech for NPC dialogue with voice archetype mapping.
// Uses the browser Web Speech API — no server cost.
// =============================================================================

const MAX_QUEUE_LENGTH = 20;
const ARCHEYPES = {
  deep:    { pitch: 0.6, rate: 0.9, label: "Deep" },
  soft:    { pitch: 1.3, rate: 0.85, label: "Soft" },
  raspy:   { pitch: 0.7, rate: 0.95, label: "Raspy" },
  high:    { pitch: 1.6, rate: 1.1, label: "High" },
  elderly: { pitch: 0.5, rate: 0.7, label: "Elderly" },
};

class TTSManager {
  constructor() {
    this.queue = [];
    this.currentUtterance = null;
    this.isPlaying = false;
    this.voices = [];
    this._initCalled = false;

    // Bind handlers
    this._onEnd = this._onEnd.bind(this);
    this._onError = this._onError.bind(this);

    // Load voices when available
    if (typeof window !== "undefined" && window.speechSynthesis) {
      this._loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        this._loadVoices();
      });
    }
  }

  /**
   * Initialize TTS — call on first user interaction.
   * Chrome requires a user gesture before speechSynthesis works.
   */
  init() {
    if (this._initCalled) return;
    this._initCalled = true;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      // Chrome workaround: cancel any pending utterance to "unlock" API
      window.speechSynthesis.cancel();
      // Force voice list load
      this._loadVoices();
    }
  }

  /** @private Load available voices from the API */
  _loadVoices() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      this.voices = window.speechSynthesis.getVoices() || [];
    }
  }

  /**
   * Speak text with optional voice configuration.
   * @param {string} text - Text to speak
   * @param {object} [options]
   * @param {string} [options.voice] - Voice name or archetype ("deep", "soft", etc.)
   * @param {number} [options.pitch=1] - Speech pitch (0.5-2.0)
   * @param {number} [options.rate=1] - Speech rate (0.5-2.0)
   * @param {number} [options.volume=1] - Volume (0-1)
   * @param {function} [options.onStart] - Called when speech starts
   * @param {function} [options.onEnd] - Called when speech ends
   */
  speak(text, options = {}) {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[TTS] SpeechSynthesis not available");
      if (options.onEnd) options.onEnd();
      return;
    }

    // Enqueue
    const item = { text, options };
    this.queue.push(item);

    // Enforce max queue length
    if (this.queue.length > MAX_QUEUE_LENGTH) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE_LENGTH);
    }

    // Start playing if not already
    if (!this.isPlaying) {
      this._processQueue();
    }
  }

  /** @private Process the next item in the queue */
  _processQueue() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentUtterance = null;
      return;
    }

    this.isPlaying = true;
    const item = this.queue.shift();
    const { text, options } = item;

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // Configure voice
      const voiceConfig = this._resolveVoice(options.voice);
      if (voiceConfig.voice) {
        utterance.voice = voiceConfig.voice;
      }
      utterance.pitch = options.pitch ?? voiceConfig.pitch ?? 1;
      utterance.rate = options.rate ?? voiceConfig.rate ?? 1;
      utterance.volume = options.volume ?? 1;

      // Events
      if (options.onStart) {
        utterance.onstart = options.onStart;
      }
      utterance.onend = () => {
        if (options.onEnd) options.onEnd();
        this._onEnd();
      };
      utterance.onerror = (e) => {
        console.warn("[TTS] Speech error:", e.error);
        if (options.onEnd) options.onEnd();
        this._onError();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[TTS] Failed to speak:", err);
      this._onEnd();
    }
  }

  /** @private Handle speech end */
  _onEnd() {
    this.currentUtterance = null;
    // Small delay before next utterance to avoid cutoff
    setTimeout(() => this._processQueue(), 50);
  }

  /** @private Handle speech error */
  _onError() {
    this.currentUtterance = null;
    setTimeout(() => this._processQueue(), 50);
  }

  /** Stop all speech and clear queue */
  stop() {
    this.queue = [];
    this.isPlaying = false;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  /** Pause current speech */
  pause() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }

  /** Resume paused speech */
  resume() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }

  /** @returns {SpeechSynthesisVoice[]} Available voices */
  getVoices() {
    return this.voices;
  }

  /** @returns {boolean} Whether currently speaking */
  isSpeaking() {
    return this.isPlaying;
  }

  /**
   * Find a voice by exact name.
   * @param {string} name
   * @returns {SpeechSynthesisVoice|null}
   */
  getVoiceByName(name) {
    return this.voices.find(v => v.name === name) || null;
  }

  /**
   * Get voice + pitch/rate config for an archetype.
   * @param {string} archetype - "deep", "soft", "raspy", "high", "elderly"
   * @returns {{ voice: SpeechSynthesisVoice|null, pitch: number, rate: number }}
   */
  getVoiceByArchetype(archetype) {
    const config = ARCHEYPES[archetype] || ARCHEYPES.soft;
    // Try to find a matching voice by gender/language cues
    let voice = null;
    const langMatch = this.voices.find(v => v.lang && v.lang.startsWith("en"));
    if (archetype === "deep" || archetype === "raspy" || archetype === "elderly") {
      voice = this.voices.find(v => v.lang && v.lang.startsWith("en") && v.name.toLowerCase().includes("male")) || langMatch;
    } else {
      voice = this.voices.find(v => v.lang && v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) || langMatch;
    }
    return { voice, pitch: config.pitch, rate: config.rate };
  }

  /**
   * Get the default English voice.
   * @returns {SpeechSynthesisVoice|null}
   */
  getDefaultVoice() {
    return this.voices.find(v => v.lang && v.lang.startsWith("en")) || this.voices[0] || null;
  }

  /**
   * Match voice to NPC archetype based on NPC data.
   * @param {object} npc - NPC object with optional voice, personality, type fields
   * @returns {{ voice: SpeechSynthesisVoice|null, pitch: number, rate: number }}
   */
  getVoiceForNpc(npc) {
    if (!npc) return { voice: this.getDefaultVoice(), pitch: 1, rate: 1 };

    // If NPC has a specific voice name set, try to use it
    if (npc.voice) {
      const exact = this.getVoiceByName(npc.voice);
      if (exact) return { voice: exact, pitch: 1, rate: 1 };
    }

    // Archetype mapping based on NPC type/personality
    const archetypeMap = [
      { archetype: "deep", match: (n) => /orc|giant|villain|dragon|brute|warrior/i.test(n.type || n.personality || n.name || "") },
      { archetype: "soft", match: (n) => /healer|merchant|priest|vendor|innkeeper|quest/i.test(n.type || n.personality || n.name || "") },
      { archetype: "raspy", match: (n) => /rogue|goblin|veteran|assassin|smuggler|pirate/i.test(n.type || n.personality || n.name || "") },
      { archetype: "high", match: (n) => /child|fairy|sprite|excited|gnome|halfling/i.test(n.type || n.personality || n.name || "") },
      { archetype: "elderly", match: (n) => /sage|elder|ancient|wizard|hermit|teacher/i.test(n.type || n.personality || n.name || "") },
    ];

    for (const entry of archetypeMap) {
      if (entry.match(npc)) {
        return this.getVoiceByArchetype(entry.archetype);
      }
    }

    return { voice: this.getDefaultVoice(), pitch: 1, rate: 1 };
  }

  /** @private Resolve a voice option to { voice, pitch, rate } */
  _resolveVoice(voiceOption) {
    if (!voiceOption) {
      return { voice: this.getDefaultVoice(), pitch: 1, rate: 1 };
    }
    // Check if it's an archetype name
    if (ARCHEYPES[voiceOption]) {
      return this.getVoiceByArchetype(voiceOption);
    }
    // Otherwise treat as voice name
    const voice = this.getVoiceByName(voiceOption);
    return { voice, pitch: 1, rate: 1 };
  }
}

// Singleton instance
const ttsManager = new TTSManager();

// Named exports matching the spec
// Supports both speak(text, options) and speak({ text, ...options })
export function init() { return ttsManager.init(); }
export function speak(text, options = {}) {
  if (typeof text === "object" && text !== null) {
    const { text: txt, ...rest } = text;
    return ttsManager.speak(txt || "", rest);
  }
  return ttsManager.speak(text, options);
}
export function stop() { return ttsManager.stop(); }
export function pause() { return ttsManager.pause(); }
export function resume() { return ttsManager.resume(); }
export function isSpeaking() { return ttsManager.isSpeaking(); }
export function getVoices() { return ttsManager.getVoices(); }
export function getVoiceForNpc(npc) { return ttsManager.getVoiceForNpc(npc); }

/** Check if SpeechSynthesis is available in this browser */
export function isTtsSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

export default ttsManager;
