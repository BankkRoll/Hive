/**
 * @fileoverview Authentication Module
 *
 * Multi-provider authentication using Convex Auth with support for
 * password-based login and OAuth providers (Twitch, Kick).
 *
 * Password Requirements:
 *   - Minimum 8 characters
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one number
 *
 * Security:
 *   - Strong password validation enforced
 *   - OAuth uses PKCE and state
 *   - All logins logged to loginHistory table
 *   - New users initialized with safe defaults
 */

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import Twitch from "@auth/core/providers/twitch";
import type { OAuth2Config } from "@auth/core/providers";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const PASSWORD_MIN_LENGTH = 8;

// ===== KICK OAUTH PROVIDER =====

interface KickProfile {
  id: string;
  username: string;
  email?: string;
  profile_picture?: string;
  bio?: string;
  verified?: boolean;
}

type KickConfig<P extends KickProfile> = Omit<
  OAuth2Config<P>,
  "id" | "name" | "type" | "authorization" | "token" | "userinfo" | "checks"
>;

function Kick<P extends KickProfile>(options: KickConfig<P>): OAuth2Config<P> {
  return {
    id: "kick",
    name: "Kick",
    type: "oauth",
    authorization: {
      url: "https://id.kick.com/oauth/authorize",
      params: { scope: "user:read" },
    },
    token: { url: "https://id.kick.com/oauth/token" },
    userinfo: { url: "https://api.kick.com/public/v1/users" },
    checks: ["pkce", "state"],
    profile(profile: P) {
      return {
        id: profile.id,
        name: profile.username,
        email: profile.email,
        image: profile.profile_picture,
      };
    },
    ...options,
  };
}

// ===== AUTH CONFIGURATION =====

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      id: "password",
      profile(params) {
        const email = params.email as string;
        const name = params.name as string | undefined;

        if (!email) throw new Error("Email is required");

        return {
          email: email.toLowerCase().trim(),
          name: name?.trim(),
          role: "user" as const,
          status: "active" as const,
          coinsBalance: 0,
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          subscribersCount: 0,
        };
      },
      validatePasswordRequirements(password: string) {
        if (!password || password.length < PASSWORD_MIN_LENGTH) {
          throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
        }
        if (!/[A-Z]/.test(password)) {
          throw new Error("Password must contain at least one uppercase letter");
        }
        if (!/[a-z]/.test(password)) {
          throw new Error("Password must contain at least one lowercase letter");
        }
        if (!/[0-9]/.test(password)) {
          throw new Error("Password must contain at least one number");
        }
      },
    }),

    Twitch({
      clientId: process.env.AUTH_TWITCH_ID!,
      clientSecret: process.env.AUTH_TWITCH_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.preferred_username,
          email: profile.email,
          image: profile.picture,
        };
      },
    }),

    Kick({
      clientId: process.env.AUTH_KICK_ID!,
      clientSecret: process.env.AUTH_KICK_SECRET!,
    }),
  ],

  callbacks: {
    async afterUserCreatedOrUpdated(
      ctx: MutationCtx,
      args: {
        userId: import("./_generated/dataModel").Id<"users">;
        existingUserId: import("./_generated/dataModel").Id<"users"> | null;
        type: "oauth" | "credentials" | "email" | "phone" | "verification";
        provider?: { id: string; type: string };
      }
    ) {
      const { userId, existingUserId, type, provider } = args;
      const isNewSignup = existingUserId === null;

      let authMethod: string;
      if (type === "oauth" && provider) {
        authMethod = `oauth:${provider.id}`;
      } else if (type === "credentials") {
        authMethod = "password";
      } else {
        authMethod = type;
      }

      await ctx.db.insert("loginHistory", {
        userId,
        ipAddress: undefined,
        userAgent: undefined,
        deviceType: undefined,
        location: undefined,
        success: true,
        failureReason: undefined,
        createdAt: Date.now(),
      });

      await ctx.db.patch(userId, { lastActiveAt: Date.now() });

      console.log(
        `[Auth] ${isNewSignup ? "Sign-up" : "Sign-in"} via ${authMethod} for user ${userId}`
      );
    },
  },
});

export { getAuthUserId };
