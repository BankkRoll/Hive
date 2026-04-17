"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mic, Square, Loader2, Send, Trash2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onComplete?: (voiceNoteId: string, audioUrl: string) => void;
  onCancel?: () => void;
  maxDurationSeconds?: number;
  className?: string;
}

export function VoiceRecorder({
  onComplete,
  onCancel,
  maxDurationSeconds = 120,
  className,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(32).fill(0));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const generateUploadUrl = useMutation(api.voiceNotes.generateUploadUrl);
  const createVoiceNote = useMutation(api.voiceNotes.create);

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Update visualizer
  const updateVisualizer = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Sample 32 frequency bands
    const bands = 32;
    const bandSize = Math.floor(dataArray.length / bands);
    const newData = [];

    for (let i = 0; i < bands; i++) {
      let sum = 0;
      for (let j = 0; j < bandSize; j++) {
        sum += dataArray[i * bandSize + j];
      }
      newData.push(sum / bandSize / 255);
    }

    setVisualizerData(newData);
    animationRef.current = requestAnimationFrame(updateVisualizer);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for visualization
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= maxDurationSeconds) {
            stopRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);

      // Start visualizer
      updateVisualizer();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone. Please check permissions.");
    }
  }, [maxDurationSeconds, updateVisualizer]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRecording(false);
    setIsPaused(false);
    setVisualizerData(new Array(32).fill(0));
  }, []);

  // Pause/resume recording
  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      updateVisualizer();
    } else {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    setIsPaused(!isPaused);
  }, [isPaused, updateVisualizer]);

  // Upload and save
  const handleSubmit = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    try {
      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload audio file
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type },
        body: audioBlob,
      });

      if (!response.ok) {
        throw new Error("Failed to upload audio");
      }

      const { storageId } = await response.json();

      // Create voice note record
      const result = await createVoiceNote({
        storageId,
        durationSeconds: duration,
        mimeType: audioBlob.type,
        fileSizeBytes: audioBlob.size,
      });

      toast.success("Voice note saved!");
      onComplete?.(result.voiceNoteId as string, audioUrl || "");

      // Reset state
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
    } catch (error) {
      console.error("Error saving voice note:", error);
      toast.error("Failed to save voice note");
    } finally {
      setIsUploading(false);
    }
  };

  // Discard recording
  const handleDiscard = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    onCancel?.();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [audioUrl]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Visualizer */}
      <div className="flex items-center justify-center gap-0.5 h-16 bg-muted/30 rounded-lg px-4">
        {visualizerData.map((value, i) => (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-75",
              isRecording && !isPaused ? "bg-red-500" : "bg-muted-foreground/30"
            )}
            style={{
              height: `${Math.max(4, value * 48)}px`,
            }}
          />
        ))}
      </div>

      {/* Timer */}
      <div className="text-center">
        <span
          className={cn(
            "text-2xl font-mono font-semibold",
            isRecording && !isPaused && "text-red-500"
          )}
        >
          {formatTime(duration)}
        </span>
        <span className="text-sm text-muted-foreground ml-2">
          / {formatTime(maxDurationSeconds)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {!isRecording && !audioBlob && (
          <Button
            size="lg"
            variant="default"
            className="rounded-full h-14 w-14 bg-red-500 hover:bg-red-600"
            onClick={startRecording}
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}

        {isRecording && (
          <>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full h-12 w-12"
              onClick={togglePause}
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="rounded-full h-14 w-14"
              onClick={stopRecording}
            >
              <Square className="h-6 w-6" />
            </Button>
          </>
        )}

        {audioBlob && !isRecording && (
          <>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full h-12 w-12"
              onClick={handleDiscard}
              disabled={isUploading}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="default"
              className="rounded-full h-14 w-14 bg-green-500 hover:bg-green-600"
              onClick={handleSubmit}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Send className="h-6 w-6" />
              )}
            </Button>
          </>
        )}
      </div>

      {/* Preview */}
      {audioUrl && !isRecording && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <audio src={audioUrl} controls className="flex-1 h-10" />
        </div>
      )}
    </div>
  );
}
