"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Globe, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkPreviewCardProps {
  url: string;
  className?: string;
  compact?: boolean;
}

export function LinkPreviewCard({ url, className, compact = false }: LinkPreviewCardProps) {
  const [fetchRequested, setFetchRequested] = useState(false);
  const preview = useQuery(api.linkPreviews.get, { url });
  const requestFetch = useMutation(api.linkPreviews.requestFetch);

  useEffect(() => {
    // If no cached preview, request a fetch
    if (preview === null && !fetchRequested) {
      setFetchRequested(true);
      requestFetch({ url }).catch(console.error);
    }
  }, [preview, fetchRequested, requestFetch, url]);

  // Extract domain for display
  const domain = extractDomain(url);

  // Loading state
  if (preview === undefined) {
    return <LinkPreviewSkeleton compact={compact} className={className} />;
  }

  // No preview available or still fetching
  if (preview === null) {
    return (
      <LinkPreviewFallback url={url} domain={domain} compact={compact} className={className} />
    );
  }

  // Render the preview
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("block group", className)}
    >
      <Card className="overflow-hidden hover:bg-muted/50 transition-colors">
        {compact ? (
          // Compact horizontal layout
          <div className="flex items-center gap-3 p-3">
            {preview.imageUrl ? (
              <div className="size-16 rounded-lg overflow-hidden bg-muted shrink-0">
                <img
                  src={preview.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="size-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Globe className="size-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {preview.title && (
                <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                  {preview.title}
                </p>
              )}
              {preview.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {preview.description}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Globe className="size-3" />
                <span>{preview.siteName || domain}</span>
              </div>
            </div>
            <ExternalLink className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ) : (
          // Full vertical layout
          <div>
            {preview.imageUrl && (
              <div className="relative aspect-[1.91/1] bg-muted overflow-hidden">
                <img
                  src={preview.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).parentElement!.style.display = "none";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Globe className="size-3" />
                <span>{preview.siteName || domain}</span>
              </div>
              {preview.title && (
                <p className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                  {preview.title}
                </p>
              )}
              {preview.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {preview.description}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>
    </a>
  );
}

// Fallback when no preview is available
function LinkPreviewFallback({
  url,
  domain,
  compact,
  className,
}: {
  url: string;
  domain: string;
  compact: boolean;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("block group", className)}
    >
      <Card className="overflow-hidden hover:bg-muted/50 transition-colors">
        <div className={cn("flex items-center gap-3", compact ? "p-3" : "p-4")}>
          <div
            className={cn(
              "rounded-lg bg-muted flex items-center justify-center shrink-0",
              compact ? "size-12" : "size-14"
            )}
          >
            <Globe className={cn("text-muted-foreground", compact ? "size-5" : "size-6")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-primary truncate group-hover:underline">{url}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{domain}</p>
          </div>
          <ExternalLink className="size-4 text-muted-foreground shrink-0" />
        </div>
      </Card>
    </a>
  );
}

// Loading skeleton
function LinkPreviewSkeleton({ compact, className }: { compact: boolean; className?: string }) {
  if (compact) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <div className="flex items-center gap-3 p-3">
          <Skeleton className="size-16 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full mt-1" />
            <Skeleton className="h-3 w-1/3 mt-1" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <Skeleton className="aspect-[1.91/1]" />
      <div className="p-3">
        <Skeleton className="h-3 w-1/4 mb-2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full mt-2" />
      </div>
    </Card>
  );
}

// Multiple link previews for a post
interface LinkPreviewsProps {
  content: string;
  maxPreviews?: number;
  compact?: boolean;
  className?: string;
}

export function LinkPreviews({
  content,
  maxPreviews = 1,
  compact = false,
  className,
}: LinkPreviewsProps) {
  const urls = useQuery(api.linkPreviews.extractUrls, { text: content });

  if (!urls || urls.length === 0) {
    return null;
  }

  const displayUrls = urls.slice(0, maxPreviews);

  return (
    <div className={cn("space-y-2", className)}>
      {displayUrls.map((url) => (
        <LinkPreviewCard key={url} url={url} compact={compact || urls.length > 1} />
      ))}
    </div>
  );
}

// Utility function to extract domain
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Utility hook for link preview
export function useLinkPreview(url: string | null) {
  const preview = useQuery(api.linkPreviews.get, url ? { url } : "skip");
  const requestFetch = useMutation(api.linkPreviews.requestFetch);
  const [fetchRequested, setFetchRequested] = useState(false);

  useEffect(() => {
    if (url && preview === null && !fetchRequested) {
      setFetchRequested(true);
      requestFetch({ url }).catch(console.error);
    }
  }, [url, preview, fetchRequested, requestFetch]);

  return {
    preview,
    isLoading: preview === undefined,
    domain: url ? extractDomain(url) : null,
  };
}
