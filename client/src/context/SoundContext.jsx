// =============================================================================
// SoundContext  Ambient soundboard + AudioContext management
// Handles:
//   1. DM-initiated playback commands (play/pause/seek/volume) via socket sync
//   2. Client-side AudioContext for synchronized audio playback
//   3. Multi-client state sync via 'sound:state' and 'sound:sync' socket events
// =============================================================================
import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useSocket } from "./SocketContext";

const debug = import.meta.env.DEV ? console.log : () => {};

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const { socket } = useSocket();
  const audioContextRef = useRef(null);
  const audioElementRef = useRef(null);
  const [soundState, setSoundState] = useState({
    trackId: null,
    action: "stop",
    position: 0,
    volume: 0.5,
    timestamp: Date.now(),
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [volume, setVolume] = useState(0.5);
  const [error, setError] = useState(null);

  // Initialize AudioContext lazily (required after user gesture)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Listen for sound:state broadcasts from server (emitted by DM)
  useEffect(() => {
    if (!socket) return;

    const handleSoundState = (state) => {
      debug("[Sound] State update:", state);
      setSoundState(state);
      setVolume(state.volume);

      if (state.action === "play" && state.trackId) {
        setIsPlaying(true);
        setCurrentTrackId(state.trackId);
        setError(null);
      } else if (state.action === "stop") {
        setIsPlaying(false);
        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.currentTime = 0;
        }
      } else if (state.action === "seek" && audioElementRef.current) {
        audioElementRef.current.currentTime = state.position;
      }
    };

    socket.on("sound:state", handleSoundState);
    return () => socket.off("sound:state", handleSoundState);
  }, [socket]);

  // Request sync on mount (reconnecting client)
  useEffect(() => {
    if (!socket) return;
    socket.emit("sound:sync");
  }, [socket]);

  // DM functions: emit sound events to sync all clients
  const playTrack = useCallback((trackId) => {
    if (!socket) return;
    const payload = { trackId, action: "play", position: 0, volume };
    socket.emit("sound:play", payload);
  }, [socket, volume]);

  const stopTrack = useCallback(() => {
    if (!socket) return;
    const payload = { trackId: null, action: "stop", position: 0, volume };
    socket.emit("sound:play", payload);
  }, [socket, volume]);

  const seekTrack = useCallback((position) => {
    if (!socket) return;
    const payload = { trackId: currentTrackId, action: "seek", position, volume };
    socket.emit("sound:play", payload);
  }, [socket, currentTrackId, volume]);

  const setVolumeAll = useCallback((newVolume) => {
    setVolume(newVolume);
    if (audioElementRef.current) {
      audioElementRef.current.volume = newVolume;
    }
  }, []);

  const contextValue = {
    soundState,
    isPlaying,
    currentTrackId,
    volume,
    error,
    playTrack,
    stopTrack,
    seekTrack,
    setVolumeAll,
    getAudioContext,
    audioElementRef,
  };

  return (
    <SoundContext.Provider value={contextValue}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound() must be used inside a <SoundProvider>.");
  }
  return ctx;
}
