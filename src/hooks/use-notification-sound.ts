"use client";

import { useCallback, useRef } from "react";

const NOTIFICATION_SOUND_SRC = "/sounds/new-message.mp3";

/**
 * Plays a short notification sound. Uses a single preloaded <audio>
 * element instead of constructing a new one per call so consecutive
 * messages don't stack up playback lag, and resets currentTime before
 * each play() so a message arriving mid-sound restarts it from zero
 * rather than being silently dropped by the still-playing instance.
 */
export function useNotificationSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!audioRef.current) {
      audioRef.current = new Audio(NOTIFICATION_SOUND_SRC);
    }

    const audio = audioRef.current;
    audio.currentTime = 0;
    // Browsers block autoplay without prior user interaction; by the
    // time a message arrives the user is already active in /inbox, but
    // swallow the rejection anyway so an occasional block never surfaces
    // as a console error or breaks the realtime handler.
    audio.play().catch(() => {});
  }, []);

  return { play };
}
