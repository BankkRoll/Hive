/**
 * @fileoverview Convex App Configuration
 *
 * Registers external components used by this Convex deployment:
 *   - R2: Cloudflare R2 storage integration
 *   - Resend: Email delivery service
 *   - Presence: Real-time user presence tracking
 */

import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";

const app = defineApp();
app.use(r2);
app.use(resend);
app.use(presence);

export default app;
