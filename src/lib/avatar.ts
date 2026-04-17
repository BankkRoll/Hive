// DiceBear Fun Emoji avatar generation
// Uses the Fun Emoji style: https://www.dicebear.com/styles/fun-emoji/

const DICEBEAR_BASE = "https://api.dicebear.com/9.x/fun-emoji/svg";

// Available background colors (pastel palette)
export const AVATAR_BG_COLORS = [
  "b6e3f4", // Light blue
  "c0aede", // Light purple
  "d1d4f9", // Lavender
  "ffd5dc", // Light pink
  "ffdfbf", // Peach
  "fef3c7", // Light yellow
  "d1fae5", // Mint
  "e0e7ff", // Periwinkle
] as const;

// Available eye styles
export const AVATAR_EYES = [
  "cute",
  "closed",
  "love",
  "plain",
  "sad",
  "shades",
  "stars",
  "wink",
  "wink2",
  "glasses",
  "crying",
  "pissed",
  "sleepClose",
  "tearDrop",
] as const;

// Available mouth styles
export const AVATAR_MOUTHS = [
  "lilSmile",
  "smileTeeth",
  "wideSmile",
  "cute",
  "smileLol",
  "tongueOut",
  "shy",
  "plain",
  "shout",
  "kissHeart",
  "drip",
  "sad",
  "pissed",
  "sick",
  "faceMask",
] as const;

export type AvatarBgColor = (typeof AVATAR_BG_COLORS)[number];
export type AvatarEyes = (typeof AVATAR_EYES)[number];
export type AvatarMouth = (typeof AVATAR_MOUTHS)[number];

export interface AvatarOptions {
  seed: string;
  backgroundColor?: AvatarBgColor;
  eyes?: AvatarEyes;
  mouth?: AvatarMouth;
  size?: number;
  radius?: number;
}

// Emoji labels for display
export const EYES_LABELS: Record<AvatarEyes, string> = {
  cute: "Cute",
  closed: "Closed",
  love: "Love",
  plain: "Plain",
  sad: "Sad",
  shades: "Shades",
  stars: "Stars",
  wink: "Wink",
  wink2: "Wink 2",
  glasses: "Glasses",
  crying: "Crying",
  pissed: "Pissed",
  sleepClose: "Sleepy",
  tearDrop: "Teardrop",
};

export const MOUTH_LABELS: Record<AvatarMouth, string> = {
  lilSmile: "Smile",
  smileTeeth: "Teeth",
  wideSmile: "Wide Smile",
  cute: "Cute",
  smileLol: "LOL",
  tongueOut: "Tongue",
  shy: "Shy",
  plain: "Plain",
  shout: "Shout",
  kissHeart: "Kiss",
  drip: "Drip",
  sad: "Sad",
  pissed: "Pissed",
  sick: "Sick",
  faceMask: "Mask",
};

/**
 * Generate a DiceBear Fun Emoji avatar URL
 */
export function generateAvatarUrl(options: AvatarOptions): string {
  const params = new URLSearchParams();

  params.set("seed", options.seed);

  if (options.backgroundColor) {
    params.set("backgroundColor", options.backgroundColor);
  }

  if (options.eyes) {
    params.set("eyes", options.eyes);
  }

  if (options.mouth) {
    params.set("mouth", options.mouth);
  }

  if (options.size) {
    params.set("size", options.size.toString());
  }

  // Always use some radius for rounded look
  params.set("radius", (options.radius ?? 50).toString());

  return `${DICEBEAR_BASE}?${params.toString()}`;
}

/**
 * Generate a random seed for avatar generation
 */
export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Get a random background color
 */
export function getRandomBgColor(): AvatarBgColor {
  return AVATAR_BG_COLORS[Math.floor(Math.random() * AVATAR_BG_COLORS.length)];
}

/**
 * Get random eyes
 */
export function getRandomEyes(): AvatarEyes {
  return AVATAR_EYES[Math.floor(Math.random() * AVATAR_EYES.length)];
}

/**
 * Get random mouth
 */
export function getRandomMouth(): AvatarMouth {
  return AVATAR_MOUTHS[Math.floor(Math.random() * AVATAR_MOUTHS.length)];
}

// ============================================
// BANNER GENERATION (DiceBear Glass Style)
// ============================================

const DICEBEAR_BANNER_BASE = "https://api.dicebear.com/9.x/glass/svg";

// Banner background colors (gradient-friendly)
export const BANNER_BG_COLORS = [
  "0f172a", // Slate dark
  "1e1b4b", // Indigo dark
  "172554", // Blue dark
  "134e4a", // Teal dark
  "1c1917", // Stone dark
  "4c1d95", // Violet
  "7c2d12", // Orange dark
  "14532d", // Green dark
] as const;

export type BannerBgColor = (typeof BANNER_BG_COLORS)[number];

export interface BannerOptions {
  seed: string;
  backgroundColor?: BannerBgColor;
}

/**
 * Generate a DiceBear Glass banner URL
 * Uses gradient background for a premium look
 */
export function generateBannerUrl(options: BannerOptions): string {
  const params = new URLSearchParams();

  params.set("seed", options.seed);

  // Use gradient background for premium look
  params.set("backgroundType", "gradientLinear");
  params.set("backgroundRotation", "0,360");

  if (options.backgroundColor) {
    params.set("backgroundColor", options.backgroundColor);
  }

  // Don't clip for wider banner appearance
  params.set("clip", "false");
  params.set("scale", "100");

  return `${DICEBEAR_BANNER_BASE}?${params.toString()}`;
}

/**
 * Get a random banner background color
 */
export function getRandomBannerBgColor(): BannerBgColor {
  return BANNER_BG_COLORS[Math.floor(Math.random() * BANNER_BG_COLORS.length)];
}
