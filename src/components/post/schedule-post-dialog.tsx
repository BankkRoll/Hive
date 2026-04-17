"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, Clock, Loader2, Send } from "lucide-react";
import { format, addDays, setHours, setMinutes, isBefore } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SchedulePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postData: {
    content: string;
    mediaIds?: Id<"media">[];
    visibility: "public" | "followers" | "subscribers" | "vip";
    isLocked?: boolean;
    unlockPrice?: number;
    pollQuestion?: string;
    pollOptions?: string[];
  };
  onScheduled: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export function SchedulePostDialog({
  open,
  onOpenChange,
  postData,
  onScheduled,
}: SchedulePostDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [selectedHour, setSelectedHour] = useState("12");
  const [selectedMinute, setSelectedMinute] = useState("0");
  const [isScheduling, setIsScheduling] = useState(false);

  const schedulePost = useMutation(api.scheduledPosts.create);

  const getScheduledTime = (): Date | null => {
    if (!selectedDate) return null;

    let date = new Date(selectedDate);
    date = setHours(date, parseInt(selectedHour, 10));
    date = setMinutes(date, parseInt(selectedMinute, 10));
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date;
  };

  const scheduledTime = getScheduledTime();
  const isValidTime = scheduledTime && !isBefore(scheduledTime, new Date());

  const handleSchedule = async () => {
    if (!scheduledTime || !isValidTime) {
      toast.error("Please select a future date and time");
      return;
    }

    setIsScheduling(true);
    try {
      await schedulePost({
        content: postData.content,
        mediaIds: postData.mediaIds,
        visibility: postData.visibility,
        isLocked: postData.isLocked,
        unlockPrice: postData.unlockPrice,
        pollQuestion: postData.pollQuestion,
        pollOptions: postData.pollOptions,
        scheduledFor: scheduledTime.getTime(),
      });

      toast.success(`Post scheduled for ${format(scheduledTime, "PPP 'at' p")}`);
      onScheduled();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule post");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            Schedule Post
          </DialogTitle>
          <DialogDescription>Choose when you want this post to be published</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Calendar */}
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => isBefore(date, new Date(new Date().setHours(0, 0, 0, 0)))}
              className="rounded-md border"
            />
          </div>

          {/* Time Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              Time
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={selectedHour}
                onValueChange={(value) => setSelectedHour(value ?? "12")}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={hour.toString()}>
                      {hour.toString().padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-lg font-medium">:</span>
              <Select
                value={selectedMinute}
                onValueChange={(value) => setSelectedMinute(value ?? "00")}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((minute) => (
                    <SelectItem key={minute} value={minute.toString()}>
                      {minute.toString().padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {scheduledTime && (
            <div
              className={cn(
                "p-4 rounded-xl text-center",
                isValidTime ? "bg-primary/10" : "bg-destructive/10"
              )}
            >
              <p className="text-sm text-muted-foreground mb-1">
                {isValidTime ? "Your post will be published on" : "Invalid time"}
              </p>
              {isValidTime && (
                <p className="font-semibold text-lg">
                  {format(scheduledTime, "EEEE, MMMM d, yyyy")}
                  <br />
                  {format(scheduledTime, "h:mm a")}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSchedule}
              disabled={!isValidTime || isScheduling}
            >
              {isScheduling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Send className="size-4" />
                  Schedule
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
