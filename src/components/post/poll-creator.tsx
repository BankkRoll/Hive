"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, GripVertical, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PollCreatorProps {
  question: string;
  onQuestionChange: (question: string) => void;
  options: string[];
  onOptionsChange: (options: string[]) => void;
  onRemove: () => void;
}

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;

export function PollCreator({
  question,
  onQuestionChange,
  options,
  onOptionsChange,
  onRemove,
}: PollCreatorProps) {
  const addOption = () => {
    if (options.length < MAX_OPTIONS) {
      onOptionsChange([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > MIN_OPTIONS) {
      onOptionsChange(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onOptionsChange(newOptions);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            <span className="font-medium">Poll</span>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onRemove}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Question */}
        <div className="space-y-2">
          <Label>Question</Label>
          <Input
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder="Ask a question..."
            maxLength={140}
          />
        </div>

        {/* Options */}
        <div className="space-y-2">
          <Label>Options</Label>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="text-muted-foreground">
                  <GripVertical className="size-4" />
                </div>
                <Input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  maxLength={50}
                  className="flex-1"
                />
                {options.length > MIN_OPTIONS && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeOption(index)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {options.length < MAX_OPTIONS && (
            <Button variant="outline" size="sm" className="w-full gap-2 mt-2" onClick={addOption}>
              <Plus className="size-4" />
              Add Option
            </Button>
          )}
        </div>

        {/* Character counts */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{question.length}/140</span>
          <span>
            {options.filter((o) => o.trim()).length}/{MAX_OPTIONS} options
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface PollDisplayProps {
  question: string;
  options: { text: string; votes: number; percentage: number }[];
  totalVotes: number;
  userVote?: number;
  onVote?: (optionIndex: number) => void;
  isEnded?: boolean;
}

export function PollDisplay({
  question,
  options,
  totalVotes,
  userVote,
  onVote,
  isEnded,
}: PollDisplayProps) {
  const hasVoted = userVote !== undefined;
  const showResults = hasVoted || isEnded;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-muted/50">
      <p className="font-medium">{question}</p>

      <div className="space-y-2">
        {options.map((option, index) => {
          const isSelected = userVote === index;
          const isWinning =
            showResults &&
            option.votes === Math.max(...options.map((o) => o.votes)) &&
            option.votes > 0;

          return (
            <button
              key={index}
              onClick={() => !showResults && onVote?.(index)}
              disabled={showResults}
              className={cn(
                "w-full relative overflow-hidden rounded-lg border p-3 text-left transition-all",
                !showResults && "hover:border-primary cursor-pointer",
                showResults && "cursor-default",
                isSelected && "border-primary ring-1 ring-primary"
              )}
            >
              {/* Progress bar */}
              {showResults && (
                <div
                  className={cn(
                    "absolute inset-0 transition-all",
                    isWinning ? "bg-primary/20" : "bg-muted"
                  )}
                  style={{ width: `${option.percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <span className={cn(isSelected && "font-medium")}>{option.text}</span>
                {showResults && <span className="font-medium">{option.percentage}%</span>}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        {totalVotes.toLocaleString()} {totalVotes === 1 ? "vote" : "votes"}
        {isEnded && " · Final results"}
      </p>
    </div>
  );
}
