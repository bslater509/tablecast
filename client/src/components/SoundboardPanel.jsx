// =============================================================================
// SoundboardPanel  DM Ambient Soundboard & Background Music Controller
// Provides: track list, upload, play/pause, volume, crossfade, loop, queue
// =============================================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { Music, Play, Square, Upload, Volume2, VolumeX, Trash2, Headphones } from "lucide-react";
import { useSound } from "../context/SoundContext";
import { useSocket } from "../context/SocketContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const debug = import.meta.env.DEV ? console.log : () => {};

const CATEGORIES = [
  { value: "COMBAT", label: "⚔️ Combat", color: "#ef4444" },
  { value: "EXPLORATION", label: "🗺️ Exploration", color: "#22c55e" },
  { value: "TOWN", label: "🏘️ Town", color: "#eab308" },
  { value: "TAVERN", label: "🍺 Tavern", color: "#f97316" },
  { value: "DUNGEON", label: "🕯️ Dungeon", color: "#a855f7" },
  { value: "WILDERNESS", label: "🌲 Wilderness", color: "#16a34a" },
  { value: "AMBIENT", label: "🌊 Ambient", color: "#06b6d4" },
];

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SoundboardPanel({ user }) {
  const { socket } = useSocket();
  const { isPlaying, currentTrackId, volume, playTrack, stopTrack, setVolumeAll } = useSound();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Fetch tracks
  const fetchTracks = useCallback(async () => {
    try {
      setLoading(true);
      const url = filterCategory
        ? `/api/soundtracks?category=${encodeURIComponent(filterCategory)}`
        : "/api/soundtracks";
      const res = await fetch(url, { headers: getJsonAuthHeaders(user) });
      if (!res.ok) throw new Error("Failed to fetch tracks");
      const data = await res.json();
      setTracks(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, user]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  // Track playback progress
  useEffect(() => {
    if (isPlaying && currentTrackId) {
      const track = tracks.find((t) => t.id === currentTrackId);
      setNowPlaying(track);

      // Fetch the audio file and play it
      const audioUrl = `/uploads/${track.filePath}`;
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.volume = volume;
      } else {
        audioRef.current.src = audioUrl;
        audioRef.current.volume = volume;
      }

      audioRef.current.play().catch((err) => {
        debug("[Soundboard] Play error:", err);
        // AudioContext may need user gesture — that's fine, DM clicked
      });

      // Update progress
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          setPlaybackProgress(audioRef.current.currentTime);
        }
      }, 500);
    } else {
      setNowPlaying(null);
      setPlaybackProgress(0);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isPlaying, currentTrackId, tracks, volume]);

  // Update volume on the audio element when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Handle upload
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      // Optional fields from filename
      formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("category", filterCategory || "AMBIENT");

      const res = await fetch("/api/soundtracks", {
        method: "POST",
        headers: { "x-tablecast-user-id": String(user.id) },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }

      await fetchTracks();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle delete track
  const handleDelete = async (trackId) => {
    if (!confirm("Delete this track?")) return;
    try {
      const res = await fetch(`/api/soundtracks/${trackId}`, {
        method: "DELETE",
        headers: getJsonAuthHeaders(user),
      });
      if (!res.ok) throw new Error("Delete failed");
      if (currentTrackId === trackId) stopTrack();
      await fetchTracks();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle play/pause toggle
  const handlePlayPause = (track) => {
    if (isPlaying && currentTrackId === track.id) {
      stopTrack();
    } else {
      playTrack(track.id);
    }
  };

  const filteredTracks = filterCategory
    ? tracks
    : tracks;

  return (
    <div className="soundboard-panel">
      <style>{`
        .soundboard-panel {
          padding: 12px;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .soundboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .soundboard-header h2 {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .soundboard-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .soundboard-controls select,
        .soundboard-controls button {
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid #374151;
          background: #1f2937;
          color: #e5e7eb;
          font-size: 13px;
          cursor: pointer;
        }
        .soundboard-controls button:hover {
          background: #374151;
        }
        .now-playing-bar {
          background: #1e293b;
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid #334155;
        }
        .now-playing-bar .track-info {
          flex: 1;
          min-width: 0;
        }
        .now-playing-bar .track-name {
          font-weight: 600;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .now-playing-bar .track-meta {
          font-size: 12px;
          color: #94a3b8;
        }
        .now-playing-bar .play-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          background: #7c3aed;
          color: white;
        }
        .now-playing-bar .play-btn:hover {
          background: #6d28d9;
        }
        .volume-slider {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 120px;
        }
        .volume-slider input[type="range"] {
          flex: 1;
          accent-color: #7c3aed;
          height: 4px;
        }
        .track-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .track-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #111827;
          border: 1px solid #1f2937;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          min-height: 44px;
        }
        .track-item:hover {
          background: #1f2937;
          border-color: #374151;
        }
        .track-item.active {
          border-color: #7c3aed;
          background: #1a1a3e;
        }
        .track-item .cat-badge {
          display: inline-block;
          width: 8px;
          height: 32px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .track-item .track-info {
          flex: 1;
          min-width: 0;
        }
        .track-item .track-name {
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .track-item .track-category {
          font-size: 11px;
          color: #6b7280;
        }
        .track-item .track-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .track-item .action-btn {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          background: transparent;
          color: #9ca3af;
        }
        .track-item .action-btn:hover {
          background: #374151;
          color: #e5e7eb;
        }
        .track-item .action-btn.danger:hover {
          background: #7f1d1d;
          color: #fca5a5;
        }
        .upload-zone {
          border: 2px dashed #374151;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s;
          color: #9ca3af;
        }
        .upload-zone:hover {
          border-color: #7c3aed;
          color: #e5e7eb;
        }
        .upload-zone.uploading {
          opacity: 0.5;
          pointer-events: none;
        }
        .error-banner {
          background: #7f1d1d;
          color: #fca5a5;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }
        .empty-state svg {
          margin: 0 auto 12px;
          opacity: 0.4;
        }
        .progress-bar {
          height: 3px;
          background: #374151;
          border-radius: 2px;
          margin-top: 6px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #7c3aed;
          border-radius: 2px;
          transition: width 0.3s;
        }
      `}</style>

      {/* Header */}
      <div className="soundboard-header">
        <h2>
          <Headphones size={20} />
          Soundboard
        </h2>
        <div className="soundboard-controls">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Now Playing Bar */}
      {isPlaying && nowPlaying && (
        <div className="now-playing-bar">
          <button className="play-btn" onClick={stopTrack}>
            <Square size={18} fill="white" />
          </button>
          <div className="track-info">
            <div className="track-name">{nowPlaying.name}</div>
            <div className="track-meta">
              {nowPlaying.category} {nowPlaying.loop ? "🔁 Loop" : ""}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${playbackProgress % 100}%` }}
              />
            </div>
          </div>
          <div className="volume-slider">
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolumeAll(parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`upload-zone ${uploading ? "uploading" : ""}`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
          style={{ display: "none" }}
          onChange={handleUpload}
        />
        {uploading ? (
          <span>Uploading...</span>
        ) : (
          <span>
            <Upload size={20} style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }} />
            Click to upload audio (MP3, OGG, WAV) — max 50MB
          </span>
        )}
      </div>

      {/* Track List */}
      <div className="track-list">
        {loading ? (
          <div className="empty-state">Loading tracks...</div>
        ) : filteredTracks.length === 0 ? (
          <div className="empty-state">
            <Music size={40} />
            <div>No tracks yet. Upload some audio to get started!</div>
          </div>
        ) : (
          filteredTracks.map((track) => {
            const cat = CATEGORIES.find((c) => c.value === track.category) || CATEGORIES[6];
            const isActive = currentTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`track-item ${isActive ? "active" : ""}`}
                onClick={() => handlePlayPause(track)}
              >
                <span className="cat-badge" style={{ background: cat.color }} />
                <div className="track-info">
                  <div className="track-name">{track.name}</div>
                  <div className="track-category">
                    {cat.label}
                    {track.duration > 0 ? ` · ${formatDuration(track.duration)}` : ""}
                    {track.loop ? " · 🔁" : ""}
                  </div>
                </div>
                <div className="track-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="action-btn"
                    title={isActive ? "Stop" : "Play"}
                  >
                    {isActive ? <Square size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    className="action-btn danger"
                    title="Delete"
                    onClick={() => handleDelete(track.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
