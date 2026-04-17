import {
  parseAsString,
  parseAsInteger,
  parseAsBoolean,
  parseAsStringLiteral,
  parseAsArrayOf,
  parseAsIsoDateTime,
  createSearchParamsCache,
  createSerializer,
  type inferParserType,
} from "nuqs/server";

// ============================================
// TYPE HELPERS
// ============================================

/**
 * Helper to infer the type from a parser or parser map
 * Usage: type MyType = ParserType<typeof myParser>
 */
export type ParserType<T> = inferParserType<T>;

// ============================================
// SHARED OPTIONS
// ============================================

/**
 * Default options for most parsers - use history push for back button support
 */
export const defaultOptions = { history: "push" } as const;

/**
 * Options for filters that should debounce URL updates
 */
export const filterOptions = {
  history: "replace",
  shallow: true,
  clearOnDefault: true,
} as const;

// ============================================
// AUTH PARSERS
// ============================================

export const authModes = ["sign-in", "sign-up"] as const;
export type AuthMode = (typeof authModes)[number];

export const authParser = parseAsStringLiteral(authModes);

// ============================================
// DIALOG/MODAL PARSERS
// ============================================

export const dialogTypes = [
  "settings",
  "create-post",
  "edit-profile",
  "share",
  "report",
  "delete-confirm",
  "media-viewer",
  "tip",
  "subscribe",
  "vault-unlock",
  "mass-message",
  "go-live",
] as const;
export type DialogType = (typeof dialogTypes)[number];

export const dialogParser = parseAsStringLiteral(dialogTypes);

// ID parser for dialogs that need to reference specific items
export const dialogIdParser = parseAsString;

// ============================================
// SETTINGS PARSERS
// ============================================

export const settingsTabs = [
  "profile",
  "account",
  "privacy",
  "notifications",
  "security",
  "subscription",
  "payments",
  "blocked",
] as const;
export type SettingsTab = (typeof settingsTabs)[number];

export const settingsTabParser = parseAsStringLiteral(settingsTabs).withDefault("profile");

// ============================================
// FEED PARSERS
// ============================================

export const feedTypes = ["for_you", "following", "subscribed"] as const;
export type FeedType = (typeof feedTypes)[number];

export const feedTypeParser = parseAsStringLiteral(feedTypes).withDefault("for_you");

export const feedFilters = ["all", "photos", "videos", "text"] as const;
export type FeedFilter = (typeof feedFilters)[number];

export const feedFilterParser = parseAsStringLiteral(feedFilters).withDefault("all");

// ============================================
// PROFILE PARSERS
// ============================================

export const profileTabs = ["posts", "media", "likes", "vault"] as const;
export type ProfileTab = (typeof profileTabs)[number];

export const profileTabParser = parseAsStringLiteral(profileTabs).withDefault("posts");

// ============================================
// SEARCH PARSERS
// ============================================

export const searchTabs = ["top", "people", "posts"] as const;
export type SearchTab = (typeof searchTabs)[number];

export const searchTabParser = parseAsStringLiteral(searchTabs).withDefault("top");
export const searchQueryParser = parseAsString;

// ============================================
// TRENDING PARSERS
// ============================================

export const trendingTabs = ["posts", "creators", "recent"] as const;
export type TrendingTab = (typeof trendingTabs)[number];

export const trendingTabParser = parseAsStringLiteral(trendingTabs).withDefault("posts");

// ============================================
// DASHBOARD PARSERS
// ============================================

export const dashboardPeriods = ["day", "week", "month", "all"] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number];

export const dashboardPeriodParser = parseAsStringLiteral(dashboardPeriods).withDefault("week");

// ============================================
// SORTING PARSERS
// ============================================

export const sortOrders = ["latest", "oldest", "popular", "trending"] as const;
export type SortOrder = (typeof sortOrders)[number];

export const sortOrderParser = parseAsStringLiteral(sortOrders).withDefault("latest");

// ============================================
// PAGINATION PARSERS
// ============================================

export const pageParser = parseAsInteger.withDefault(1);
export const limitParser = parseAsInteger.withDefault(20);
export const cursorParser = parseAsString;

// ============================================
// NOTIFICATION PARSERS
// ============================================

export const notificationFilters = [
  "all",
  "likes",
  "comments",
  "follows",
  "subscriptions",
  "tips",
  "mentions",
] as const;
export type NotificationFilter = (typeof notificationFilters)[number];

export const notificationFilterParser =
  parseAsStringLiteral(notificationFilters).withDefault("all");
export const notificationUnreadOnlyParser = parseAsBoolean.withDefault(false);

// ============================================
// MESSAGES PARSERS
// ============================================

export const messageThreadParser = parseAsString; // thread/conversation ID
export const messageSearchParser = parseAsString;

// ============================================
// MEDIA VIEWER PARSERS
// ============================================

export const mediaIndexParser = parseAsInteger.withDefault(0);
export const mediaIdParser = parseAsString;

// ============================================
// WALLET/TRANSACTIONS PARSERS
// ============================================

export const transactionTypes = ["all", "tips", "subscriptions", "purchases", "payouts"] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const transactionTypeParser = parseAsStringLiteral(transactionTypes).withDefault("all");
export const transactionDateFromParser = parseAsIsoDateTime;
export const transactionDateToParser = parseAsIsoDateTime;

// ============================================
// ADMIN PARSERS
// ============================================

export const adminTabs = ["users", "posts", "reports", "analytics", "settings"] as const;
export type AdminTab = (typeof adminTabs)[number];

export const adminTabParser = parseAsStringLiteral(adminTabs).withDefault("users");

export const userStatusFilters = [
  "all",
  "active",
  "suspended",
  "banned",
  "pending_review",
] as const;
export type UserStatusFilter = (typeof userStatusFilters)[number];

export const userStatusFilterParser = parseAsStringLiteral(userStatusFilters).withDefault("all");

export const userRoleFilters = [
  "all",
  "user",
  "creator",
  "platform_mod",
  "admin",
  "super_admin",
] as const;
export type UserRoleFilter = (typeof userRoleFilters)[number];

export const userRoleFilterParser = parseAsStringLiteral(userRoleFilters).withDefault("all");

export const reportStatusFilters = ["pending", "resolved", "dismissed", "all"] as const;
export type ReportStatusFilter = (typeof reportStatusFilters)[number];

export const reportStatusFilterParser =
  parseAsStringLiteral(reportStatusFilters).withDefault("pending");

// ============================================
// BOOLEAN FLAGS
// ============================================

export const showNsfwParser = parseAsBoolean.withDefault(false);
export const compactViewParser = parseAsBoolean.withDefault(false);
export const autoplayParser = parseAsBoolean.withDefault(true);

// ============================================
// MULTI-VALUE PARSERS
// ============================================

// For filtering by multiple tags
export const tagsParser = parseAsArrayOf(parseAsString);

// For filtering by multiple creators
export const creatorsParser = parseAsArrayOf(parseAsString);

// ============================================
// COMBINED PARSER MAPS
// ============================================

/**
 * All auth-related parsers
 */
export const authParsers = {
  auth: authParser,
} as const;

/**
 * All feed-related parsers
 */
export const feedParsers = {
  feed: feedTypeParser,
  filter: feedFilterParser,
  sort: sortOrderParser,
} as const;

/**
 * All search-related parsers
 */
export const searchParsers = {
  q: searchQueryParser,
  tab: searchTabParser,
  sort: sortOrderParser,
  page: pageParser,
} as const;

/**
 * All profile-related parsers
 */
export const profileParsers = {
  tab: profileTabParser,
  sort: sortOrderParser,
} as const;

/**
 * All notification-related parsers
 */
export const notificationParsers = {
  filter: notificationFilterParser,
  unread: notificationUnreadOnlyParser,
} as const;

/**
 * All transaction-related parsers
 */
export const transactionParsers = {
  type: transactionTypeParser,
  from: transactionDateFromParser,
  to: transactionDateToParser,
  page: pageParser,
} as const;

/**
 * All admin-related parsers
 */
export const adminParsers = {
  tab: adminTabParser,
  status: userStatusFilterParser,
  reportStatus: reportStatusFilterParser,
  q: searchQueryParser,
  page: pageParser,
} as const;

/**
 * Dialog state parsers
 */
export const dialogParsers = {
  dialog: dialogParser,
  dialogId: dialogIdParser,
} as const;

// ============================================
// SERVER-SIDE CACHE
// ============================================

/**
 * Master search params cache for server components
 * Use searchParamsCache.parse(searchParams) in page components
 * Use searchParamsCache.get('key') in nested server components
 */
export const searchParamsCache = createSearchParamsCache({
  // Auth
  auth: authParser,

  // Dialogs
  dialog: dialogParser,
  dialogId: dialogIdParser,

  // Settings
  settingsTab: settingsTabParser,

  // Feed
  feed: feedTypeParser,
  feedFilter: feedFilterParser,

  // Profile
  profileTab: profileTabParser,

  // Search
  q: searchQueryParser,
  searchCategory: searchTabParser,

  // Sorting & Pagination
  sort: sortOrderParser,
  page: pageParser,
  limit: limitParser,
  cursor: cursorParser,

  // Notifications
  notificationFilter: notificationFilterParser,
  unreadOnly: notificationUnreadOnlyParser,

  // Messages
  thread: messageThreadParser,

  // Media
  mediaIndex: mediaIndexParser,
  mediaId: mediaIdParser,

  // Transactions
  txType: transactionTypeParser,
  txFrom: transactionDateFromParser,
  txTo: transactionDateToParser,

  // Admin
  adminTab: adminTabParser,
  userStatus: userStatusFilterParser,
  reportStatus: reportStatusFilterParser,

  // Flags
  nsfw: showNsfwParser,
  compact: compactViewParser,
  autoplay: autoplayParser,

  // Multi-value
  tags: tagsParser,
  creators: creatorsParser,
});

// ============================================
// SERIALIZERS
// ============================================

/**
 * Serialize auth dialog URL
 * Usage: authSerializer({ auth: 'sign-in' }) => '?auth=sign-in'
 */
export const authSerializer = createSerializer(authParsers);

/**
 * Serialize feed URLs
 * Usage: feedSerializer('/', { feed: 'following', filter: 'videos' })
 */
export const feedSerializer = createSerializer(feedParsers);

/**
 * Serialize search URLs
 * Usage: searchSerializer('/search', { q: 'hello', category: 'users' })
 */
export const searchSerializer = createSerializer(searchParsers);

/**
 * Serialize profile URLs
 * Usage: profileSerializer('/username', { tab: 'media' })
 */
export const profileSerializer = createSerializer(profileParsers);

/**
 * Serialize notification URLs
 */
export const notificationSerializer = createSerializer(notificationParsers);

/**
 * Serialize transaction URLs
 */
export const transactionSerializer = createSerializer(transactionParsers);

/**
 * Serialize admin URLs
 */
export const adminSerializer = createSerializer(adminParsers);

/**
 * Serialize dialog URLs
 * Usage: dialogSerializer(window.location.href, { dialog: 'settings' })
 */
export const dialogSerializer = createSerializer(dialogParsers);

// ============================================
// URL BUILDER HELPERS
// ============================================

/**
 * Build a URL with auth dialog open
 */
export function buildAuthUrl(base: string, mode: AuthMode = "sign-in"): string {
  return authSerializer(base, { auth: mode });
}

/**
 * Build a profile URL with specific tab
 */
export function buildProfileUrl(username: string, tab?: ProfileTab): string {
  const base = `/${username}`;
  return tab ? profileSerializer(base, { tab }) : base;
}

/**
 * Build a search URL
 */
export function buildSearchUrl(query: string, tab?: SearchTab): string {
  return searchSerializer("/search", {
    q: query,
    tab: tab ?? null,
  });
}

/**
 * Build a feed URL with filters
 */
export function buildFeedUrl(feedType?: FeedType, filter?: FeedFilter, sort?: SortOrder): string {
  return feedSerializer("/", {
    feed: feedType ?? null,
    filter: filter ?? null,
    sort: sort ?? null,
  });
}

// ============================================
// TYPE EXPORTS
// ============================================

export type SearchParamsCache = typeof searchParamsCache;
export type AllSearchParams = ParserType<typeof searchParamsCache>;
