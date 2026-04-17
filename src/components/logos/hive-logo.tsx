import { cn } from "@/lib/utils";

interface HiveLogoProps {
  className?: string;
}

export function HiveLogo({ className }: HiveLogoProps) {
  // Design system: stroke width 9, gap 5, radius 1.09/0.75
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 113 30"
      fill="none"
      className={cn("fill-current", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* H: 0-23 (width 23) */}
      <rect x="0" y="0" width="9" height="30" rx="1.09" />
      <rect x="14" y="0" width="9" height="30" rx="1.09" />
      <rect x="7" y="11" width="9" height="8" rx="0.75" />

      {/* I: 29-40 (gap 6, width 11) */}
      <rect x="29" y="0" width="11" height="30" rx="1.09" />

      {/* V: 44-78 (gap 4 optical, width 34) */}
      <path d="M44 1.09c0-.602.488-1.09 1.09-1.09h7.82c.45 0 .85.28 1.01.7L61 18l7.08-17.3a1.09 1.09 0 0 1 1.01-.7h7.82c.6 0 1.09.49 1.09 1.09 0 .14-.03.27-.08.4L64.5 29.31a1.09 1.09 0 0 1-1 .69h-5a1.09 1.09 0 0 1-1-.69L44.08 1.49a1.09 1.09 0 0 1-.08-.4z" />

      {/* E: 84-113 (gap 6, width 29) */}
      <rect x="84" y="0" width="9" height="30" rx="1.09" />
      <rect x="91" y="0" width="20" height="8" rx="1.09" />
      <rect x="91" y="11" width="15" height="8" rx="0.75" />
      <rect x="91" y="22" width="20" height="8" rx="1.09" />
    </svg>
  );
}
