"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStorageUrl } from "@/hooks/use-storage-url";
import { Id } from "../../../convex/_generated/dataModel";

interface VoicePlayerProps {
  storageId?: Id<"_storage">;
  audioUrl?: string;
  duration?: number;
  waveformData?: number[];
  className?: string;
  compact?: boolean;
}

export function VoicePlayer({
  storageId,
  audioUrl: externalUrl,
  duration: initialDuration,
  waveformData,
  className,
  compact = false,
}: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Get audio URL from storage if storageId provided
  const storageUrl = useStorageUrl(storageId);
  const audioUrl = externalUrl || storageUrl;

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Handle mute
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle seek
  const handleSeek = useCallback((value: number | readonly number[]) => {
    if (!audioRef.current) return;
    const newTime = Array.isArray(value) ? value[0] : value;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  // Handle click on waveform
  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !audioRef.current) return;

      const rect = progressRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;

      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  // Set up audio element
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl]);

  // Generate default waveform if not provided
  const bars =
    waveformData || new Array(compact ? 20 : 40).fill(0).map(() => Math.random() * 0.5 + 0.2);
  const progress = duration > 0 ? currentTime / duration : 0;

  if (!audioUrl) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg bg-muted/50 animate-pulse",
          className
        )}
      >
        <div className="h-8 w-8 rounded-full bg-muted" />
        <div className="flex-1 h-4 rounded bg-muted" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 p-2 rounded-full bg-muted/50", className)}>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={togglePlay}
          disabled={!isLoaded}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        {/* Mini waveform */}
        <div
          ref={progressRef}
          className="flex-1 flex items-center gap-px h-6 cursor-pointer"
          onClick={handleWaveformClick}
        >
          {bars.map((height, i) => {
            const barProgress = i / bars.length;
            const isPlayed = barProgress <= progress;

            return (
              <div
                key={i}
                className={cn(
                  "w-0.5 rounded-full transition-colors",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/30"
                )}
                style={{ height: `${height * 24}px` }}
              />
            );
          })}
        </div>

        <span className="text-xs text-muted-foreground font-mono min-w-[32px]">
          {formatTime(isPlaying ? currentTime : duration)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border", className)}>
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="secondary"
          className="h-10 w-10 rounded-full shrink-0"
          onClick={togglePlay}
          disabled={!isLoaded}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>

        {/* Waveform visualization */}
        <div
          ref={progressRef}
          className="flex-1 flex items-center gap-0.5 h-10 cursor-pointer"
          onClick={handleWaveformClick}
        >
          {bars.map((height, i) => {
            const barProgress = i / bars.length;
            const isPlayed = barProgress <= progress;

            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-all duration-100",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/20"
                )}
                style={{ height: `${Math.max(4, height * 40)}px` }}
              />
            );
          })}
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full shrink-0"
          onClick={toggleMute}
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Time and slider */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono min-w-[32px]">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground font-mono min-w-[32px]">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
