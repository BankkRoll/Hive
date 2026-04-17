/**
 * @fileoverview Convex Auth Configuration
 *
 * Defines trusted authentication providers for this deployment.
 * Uses CONVEX_SITE_URL environment variable for the provider domain.
 */

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
