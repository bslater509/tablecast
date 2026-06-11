// =============================================================================
// Tablecast — AI Companion Setup Panel
// =============================================================================
import { useState, useEffect } from "react";
import { styles } from "./settingsStyles";
import { fetchAiSettings as apiFetchAiSettings } from "./settingsApi";

function AiSetup({ authHeaders, jsonAuthHeaders, addToast }) {
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiOllamaUrl, setAiOllamaUrl] = useState("http://localhost:11434");
  const [aiOllamaModel, setAiOllamaModel] = useState("llama3");
  const [aiModel, setAiModel] = useState("gpt-5-nano");
  const [aiImagePromptStyle, setAiImagePromptStyle] = useState("");
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [savingAi, setSavingAi] = useState(false);
  const [availableAiModels, setAvailableAiModels] = useState([]);
  const [fetchingAiModels, setFetchingAiModels] = useState(false);
  const [availableZenModels, setAvailableZenModels] = useState([]);
  const [fetchingZenModels, setFetchingZenModels] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetchAiSettings(authHeaders);
        if (data) {
          setAiProvider(data.provider || "gemini");
          setAiApiKey(data.apiKey || "");
          setAiOllamaUrl(data.ollamaUrl || "http://localhost:11434");
          setAiOllamaModel(data.ollamaModel || "llama3");
          setAiModel(data.model || "gpt-5-nano");
          setAiImagePromptStyle(data.imagePromptStyle || "");
        }
      } catch (err) { console.error("Failed to load AI settings:", err); }
    })();
  }, []);

  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    if (savingAi) return;
    setSavingAi(true);
    try {
      const saveRes = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          ollamaUrl: aiOllamaUrl,
          ollamaModel: aiOllamaModel,
          model: aiModel,
          imagePromptStyle: aiImagePromptStyle,
        }),
      });
      if (!saveRes.ok) { const err = await saveRes.json(); addToast(`Error saving AI settings: ${err.error || "Unknown"}`, "error"); return; }

      const testRes = await fetch("/api/ai/test", {
        method: "POST", headers: jsonAuthHeaders,
        body: JSON.stringify({ provider: aiProvider, apiKey: aiApiKey, ollamaUrl: aiOllamaUrl, ollamaModel: aiOllamaModel, model: aiModel }),
      });
      if (testRes.ok) { addToast("AI settings saved and connection successful!", "success"); }
      else { const testErr = await testRes.json(); addToast(`AI settings saved, but connection test failed: ${testErr.error || "Unknown"}`, "warning"); }

      (async () => {
        try {
          const data = await apiFetchAiSettings(authHeaders);
          if (data) {
            setAiProvider(data.provider || "gemini");
            setAiApiKey(data.apiKey || "");
            setAiOllamaUrl(data.ollamaUrl || "http://localhost:11434");
            setAiOllamaModel(data.ollamaModel || "llama3");
            setAiModel(data.model || "gpt-5-nano");
            setAiImagePromptStyle(data.imagePromptStyle || "");
          }
        } catch (err) { console.error("Failed to load AI settings:", err); }
      })();
    } catch (err) { addToast(`Network error saving AI settings: ${err.message}`, "error"); }
    finally { setSavingAi(false); }
  };

  const handleFetchAiModels = async () => {
    if (fetchingAiModels) return;
    setFetchingAiModels(true);
    setAvailableAiModels([]);
    try {
      const res = await fetch(`/api/ai/models?provider=${aiProvider}&url=${encodeURIComponent(aiOllamaUrl)}`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setAvailableAiModels(data.models || []);
        if (data.models && data.models.length > 0) {
          if (!data.models.includes(aiOllamaModel)) setAiOllamaModel(data.models[0]);
        } else {
          addToast("No loaded models found. Make sure your local server has a model active/loaded.", "warning");
        }
      } else { addToast(`Failed to fetch models: ${data.error || "Unknown error"}`, "error"); }
    } catch (err) { addToast(`Network error fetching models: ${err.message}`, "error"); }
    finally { setFetchingAiModels(false); }
  };

  const handleFetchZenModels = async () => {
    if (fetchingZenModels) return;
    setFetchingZenModels(true);
    setAvailableZenModels([]);
    try {
      const res = await fetch("/api/ai/zen-models", { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setAvailableZenModels(data.models || []);
        if (data.models && data.models.length > 0 && !data.models.includes(aiModel)) setAiModel(data.models[0]);
      } else { addToast(`Failed to fetch Zen models: ${data.error || "Unknown error"}`, "error"); }
    } catch (err) { addToast(`Network error fetching Zen models: ${err.message}`, "error"); }
    finally { setFetchingZenModels(false); }
  };

  const handleTestAiSettings = async () => {
    if (aiTesting) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST", headers: jsonAuthHeaders,
        body: JSON.stringify({ provider: aiProvider, apiKey: aiApiKey, ollamaUrl: aiOllamaUrl, ollamaModel: aiOllamaModel, model: aiModel }),
      });
      const data = await res.json();
      if (res.ok) { setAiTestResult({ success: true, message: `Connection test successful! Reply: ${data.reply}` }); }
      else { setAiTestResult({ success: false, message: `Connection test failed: ${data.error}` }); }
    } catch (err) { setAiTestResult({ success: false, message: `Network error: ${err.message}` }); }
    finally { setAiTesting(false); }
  };

  return (
    <div style={styles.content}>
      <section style={styles.card} className="glass-panel gold-border-glow">
        <h2 style={styles.cardTitle}>D&D AI Companion Setup</h2>
        <p style={styles.cardDesc}>
          Configure your preferred LLM provider for the AI Companion chat and slash commands.
          API credentials are saved securely in the database and never sent to players.
        </p>

        <form onSubmit={handleSaveAiSettings} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>AI Provider</label>
            <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={styles.select} disabled={savingAi}>
              <option value="gemini">Google Gemini (1.5 Flash)</option>
              <option value="openai">OpenAI (GPT-4o mini)</option>
              <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
              <option value="ollama">Local Ollama (Offline LAN)</option>
              <option value="lmstudio">LM Studio (Local OpenAI-compatible)</option>
              <option value="opencode">OpenCode Zen (Multi-Model LLM Gateway)</option>
            </select>
          </div>

          {(aiProvider === "ollama" || aiProvider === "lmstudio") ? (
            <>
              <div style={styles.inputGroup}>
                <label htmlFor="ai-ollama-url-input" style={styles.label}>
                  {aiProvider === "lmstudio" ? "LM Studio API Endpoint URL" : "Ollama API Endpoint URL"}
                </label>
                <input id="ai-ollama-url-input" type="text"
                  placeholder={aiProvider === "lmstudio" ? "e.g. http://host.docker.internal:1234" : "e.g. http://localhost:11434"}
                  value={aiOllamaUrl} onChange={(e) => setAiOllamaUrl(e.target.value)} style={styles.input} className="form-input" disabled={savingAi} required />
              </div>
              <div style={styles.inputGroup}>
                <label htmlFor="ai-ollama-model-input" style={styles.label}>Model Name / Identifier</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input id="ai-ollama-model-input" type="text"
                    placeholder={aiProvider === "lmstudio" ? "e.g. meta-llama-3-8b-instruct" : "e.g. llama3, mistral, gemma"}
                    value={aiOllamaModel} onChange={(e) => setAiOllamaModel(e.target.value)} style={{ ...styles.input, flex: 1 }} className="form-input" disabled={savingAi} required />
                  <button type="button" onClick={handleFetchAiModels} disabled={fetchingAiModels || !aiOllamaUrl}
                    style={{ padding: "0.5rem 0.75rem", border: "1px solid rgba(200, 151, 58, 0.35)", borderRadius: "6px", background: "rgba(200, 151, 58, 0.08)", color: "var(--color-accent)", fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", minHeight: "44px", whiteSpace: "nowrap" }}
                    className="touch-target btn-hover-scale">{fetchingAiModels ? "Fetching..." : "Fetch Models"}</button>
                </div>
                {availableAiModels.length > 0 && (
                  <div style={{ marginTop: "0.35rem" }}>
                    <label htmlFor="ai-model-select" style={{ ...styles.label, fontSize: "0.75rem", color: "var(--color-muted)" }}>Select from loaded models:</label>
                    <select id="ai-model-select" value={aiOllamaModel} onChange={(e) => setAiOllamaModel(e.target.value)}
                      style={{ ...styles.input, padding: "0.5rem", fontSize: "0.85rem", marginTop: "0.15rem", background: "rgba(0, 0, 0, 0.3)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                      {!availableAiModels.includes(aiOllamaModel) && <option value={aiOllamaModel}>{aiOllamaModel || "(None Selected)"}</option>}
                      {availableAiModels.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.inputGroup}>
              <label htmlFor="ai-key-input" style={styles.label}>API Key</label>
              <input id="ai-key-input" type="password" placeholder={aiApiKey ? "Leave empty to keep saved key" : "Enter API Key"}
                value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} style={styles.input} className="form-input" disabled={savingAi} />
              <small style={styles.helpText}>API key will be saved securely. If you see a masked key (e.g. `abcd...1234`), leave it unchanged to keep the saved key.</small>
            </div>
          )}

          {aiProvider === "opencode" && (
            <div style={styles.inputGroup}>
              <label htmlFor="ai-zen-model-input" style={styles.label}>Zen Model Name</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input id="ai-zen-model-input" type="text" placeholder="e.g. gpt-5-nano, claude-sonnet-4-6, gemini-3.1-pro"
                  value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={{ ...styles.input, flex: 1 }} className="form-input" disabled={savingAi} required />
                <button type="button" onClick={handleFetchZenModels} disabled={fetchingZenModels}
                  style={{ padding: "0.5rem 0.75rem", border: "1px solid rgba(200, 151, 58, 0.35)", borderRadius: "6px", background: "rgba(200, 151, 58, 0.08)", color: "var(--color-accent)", fontWeight: "bold", fontSize: "0.8rem", cursor: "pointer", minHeight: "44px", whiteSpace: "nowrap" }}
                  className="touch-target btn-hover-scale">{fetchingZenModels ? "Fetching..." : "Fetch Models"}</button>
              </div>
              <small style={styles.helpText}>Model ID from OpenCode Zen. See <a href="https://opencode.ai/zen" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>Zen model list</a> for available models.</small>
              {availableZenModels.length > 0 && (
                <div style={{ marginTop: "0.35rem" }}>
                  <label style={{ ...styles.label, fontSize: "0.75rem", color: "var(--color-muted)" }}>Select from available models:</label>
                  <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                    style={{ ...styles.input, padding: "0.5rem", fontSize: "0.85rem", marginTop: "0.15rem", background: "rgba(0, 0, 0, 0.3)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                    {availableZenModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div style={{ ...styles.inputGroup, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <label htmlFor="ai-image-prompt-style" style={styles.label}>NPC Image Prompt Style</label>
            <textarea id="ai-image-prompt-style" rows={3} value={aiImagePromptStyle} onChange={(e) => setAiImagePromptStyle(e.target.value)}
              placeholder="e.g. fantasy digital painting, dramatic lighting, detailed, in the style of Greg Rutkowski, 4k, ultra detailed --ar 2:3"
              style={{ ...styles.input, width: "100%", resize: "vertical", fontSize: "0.85rem" }} className="form-input" disabled={savingAi} />
            <small style={styles.helpText}>
              This style text is appended to every "Copy Image Prompt" action for NPCs. Set your preferred art style, medium, aspect ratio, or artist reference. Leave empty for no style suffix.
            </small>
          </div>

          {aiTestResult && (
            <div style={{ ...styles.statusBanner, backgroundColor: aiTestResult.success ? "rgba(111, 207, 151, 0.1)" : "rgba(235, 87, 87, 0.1)", borderColor: aiTestResult.success ? "var(--color-success)" : "var(--color-danger)" }}>
              <span style={{ fontSize: "0.85rem", color: aiTestResult.success ? "var(--color-success)" : "var(--color-danger)", fontWeight: "bold" }}>
                {aiTestResult.success ? "Test Passed" : "Test Failed"}
              </span>
              <p style={{ ...styles.bannerMessage, fontSize: "0.8rem", marginTop: "0.2rem" }}>{aiTestResult.message}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" onClick={handleTestAiSettings} disabled={aiTesting || savingAi}
              style={{ ...styles.secondaryBtn, flex: 1, minHeight: "44px" }} className="touch-target btn-hover-scale">
              {aiTesting ? "Testing..." : "Test Connection"}
            </button>
            <button type="submit" disabled={savingAi || aiTesting}
              style={{ ...styles.backupBtn, flex: 1, minHeight: "44px", background: savingAi ? "var(--color-accent-dim)" : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)", color: savingAi ? "var(--color-muted)" : "var(--color-bg)" }}
              className="touch-target btn-hover-scale">
              {savingAi ? "Saving..." : "Save Config"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AiSetup;
