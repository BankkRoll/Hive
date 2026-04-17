import { cn } from "@/lib/utils";

interface KickIconProps {
  className?: string;
}

export function KickIcon({ className }: KickIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 453.9 510.6" className={cn(className)}>
      <path
        fill="#53fc18"
        fillRule="evenodd"
        d="M0,0h170.2v113.5h56.7v-56.7h56.7V0h170.2v170.2h-56.7v56.7h-56.7v56.7h56.7v56.7h56.7v170.2h-170.2v-56.7h-56.7v-56.7h-56.7v113.5H0V0Z"
      />
    </svg>
  );
}
