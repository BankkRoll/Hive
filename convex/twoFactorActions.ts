/**
 * @fileoverview Two-Factor Authentication Actions
 *
 * Handles TOTP generation, verification, and cryptographic operations for 2FA.
 * Runs in Node.js environment for crypto library access.
 *
 * Features:
 *   - TOTP secret generation with QR code URL
 *   - Code verification with time window tolerance
 *   - Backup code generation and verification
 *   - Secure 2FA enable/disable workflows
 *
 * Security:
 *   - Uses SHA-256 for backup code hashing
 *   - TOTP with SHA1 algorithm, 6 digits, 30-second period
 *   - Validation window of +/- 1 period for clock drift
 *   - Requires current code verification before disabling
 *   - 10 backup codes generated per setup
 */

"use node";

import * as OTPAuth from "otpauth";
import * as crypto from "crypto";

import { action, internalAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const APP_NAME = "HIVE";

// ===== ACTIONS =====

/** Generate a new TOTP secret and return setup info with QR code URL */
export const initiateSetup = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    success: boolean;
    secret?: string;
    qrCodeUrl?: string;
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const secret = new OTPAuth.Secret({ size: 20 });

    const user = await ctx.runQuery(internal.users.getByIdInternal, { userId });
    const label = user?.email || user?.username || "user";

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      label,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const qrCodeUrl = totp.toString();

    await ctx.runMutation(internal.twoFactor.storeSetupSecret, {
      userId,
      totpSecret: secret.base32,
    });

    return {
      success: true,
      secret: secret.base32,
      qrCodeUrl,
    };
  },
});

/** Verify TOTP code and enable 2FA, returning backup codes */
export const confirmSetup = action({
  args: {
    code: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    backupCodes?: string[];
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const setup = await ctx.runQuery(internal.twoFactor.getSetupSecret, {
      userId,
    });
    if (!setup) {
      return { success: false, error: "No pending 2FA setup found" };
    }

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setup.totpSecret),
    });

    const delta = totp.validate({ token: args.code, window: 1 });
    if (delta === null) {
      return { success: false, error: "Invalid verification code" };
    }

    const backupCodes: string[] = [];
    const backupCodeHashes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const formattedCode = code.slice(0, 4) + "-" + code.slice(4);
      backupCodes.push(formattedCode);
      backupCodeHashes.push(crypto.createHash("sha256").update(formattedCode).digest("hex"));
    }

    await ctx.runMutation(internal.twoFactor.enable, {
      userId,
      totpSecret: setup.totpSecret,
      backupCodeHashes,
    });

    return {
      success: true,
      backupCodes,
    };
  },
});

/** Verify a TOTP or backup code for login */
export const verifyCode = action({
  args: {
    userId: v.id("users"),
    code: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const twoFactorData = await ctx.runMutation(internal.twoFactor.getTwoFactorData, {
      userId: args.userId,
    });

    if (!twoFactorData) {
      return { success: false, error: "2FA not enabled" };
    }

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(twoFactorData.totpSecret),
    });

    const delta = totp.validate({ token: args.code, window: 1 });
    if (delta !== null) {
      await ctx.runMutation(internal.twoFactor.updateLastVerified, {
        userId: args.userId,
      });
      return { success: true };
    }

    const normalizedCode = args.code.toUpperCase().replace(/[^A-F0-9]/g, "");
    const formattedCode =
      normalizedCode.length === 8
        ? normalizedCode.slice(0, 4) + "-" + normalizedCode.slice(4)
        : args.code.toUpperCase();

    const codeHash = crypto.createHash("sha256").update(formattedCode).digest("hex");

    for (let i = 0; i < twoFactorData.backupCodes.length; i++) {
      const backupCode = twoFactorData.backupCodes[i];
      if (!backupCode.usedAt && backupCode.codeHash === codeHash) {
        await ctx.runMutation(internal.twoFactor.markBackupCodeUsed, {
          userId: args.userId,
          codeIndex: i,
        });
        return { success: true };
      }
    }

    return { success: false, error: "Invalid verification code" };
  },
});

/** Regenerate backup codes (requires current TOTP code for security) */
export const regenerateBackupCodes = action({
  args: {
    currentCode: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    backupCodes?: string[];
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const twoFactorData = await ctx.runMutation(internal.twoFactor.getTwoFactorData, {
      userId,
    });

    if (!twoFactorData) {
      return { success: false, error: "2FA not enabled" };
    }

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(twoFactorData.totpSecret),
    });

    const delta = totp.validate({ token: args.currentCode, window: 1 });
    if (delta === null) {
      return { success: false, error: "Invalid verification code" };
    }

    const backupCodes: string[] = [];
    const backupCodeHashes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const formattedCode = code.slice(0, 4) + "-" + code.slice(4);
      backupCodes.push(formattedCode);
      backupCodeHashes.push(crypto.createHash("sha256").update(formattedCode).digest("hex"));
    }

    await ctx.runMutation(internal.twoFactor.enable, {
      userId,
      totpSecret: twoFactorData.totpSecret,
      backupCodeHashes,
    });

    return {
      success: true,
      backupCodes,
    };
  },
});

/** Disable 2FA (requires current TOTP or backup code for security) */
export const disable = action({
  args: {
    code: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const twoFactorData = await ctx.runMutation(internal.twoFactor.getTwoFactorData, { userId });

    if (!twoFactorData) {
      return { success: false, error: "2FA is not enabled" };
    }

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(twoFactorData.totpSecret),
    });

    const delta = totp.validate({ token: args.code, window: 1 });
    if (delta === null) {
      const normalizedCode = args.code.toUpperCase().replace(/[^A-F0-9]/g, "");
      const formattedCode =
        normalizedCode.length === 8
          ? normalizedCode.slice(0, 4) + "-" + normalizedCode.slice(4)
          : args.code.toUpperCase();

      const codeHash = crypto.createHash("sha256").update(formattedCode).digest("hex");

      let validBackup = false;
      for (const backupCode of twoFactorData.backupCodes) {
        if (!backupCode.usedAt && backupCode.codeHash === codeHash) {
          validBackup = true;
          break;
        }
      }

      if (!validBackup) {
        return { success: false, error: "Invalid verification code" };
      }
    }

    await ctx.runMutation(internal.twoFactor.disableInternal, { userId });

    return { success: true };
  },
});

// ===== INTERNAL ACTIONS =====

/** Verify 2FA code internally (used by secure admin actions) */
export const verifyCodeInternal = internalAction({
  args: {
    userId: v.id("users"),
    code: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const twoFactorData = await ctx.runMutation(internal.twoFactor.getTwoFactorData, {
      userId: args.userId,
    });

    if (!twoFactorData) {
      return { success: true };
    }

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(twoFactorData.totpSecret),
    });

    const delta = totp.validate({ token: args.code, window: 1 });
    if (delta !== null) {
      await ctx.runMutation(internal.twoFactor.updateLastVerified, {
        userId: args.userId,
      });
      return { success: true };
    }

    const normalizedCode = args.code.toUpperCase().replace(/[^A-F0-9]/g, "");
    const formattedCode =
      normalizedCode.length === 8
        ? normalizedCode.slice(0, 4) + "-" + normalizedCode.slice(4)
        : args.code.toUpperCase();

    const codeHash = crypto.createHash("sha256").update(formattedCode).digest("hex");

    for (let i = 0; i < twoFactorData.backupCodes.length; i++) {
      const backupCode = twoFactorData.backupCodes[i];
      if (!backupCode.usedAt && backupCode.codeHash === codeHash) {
        await ctx.runMutation(internal.twoFactor.markBackupCodeUsed, {
          userId: args.userId,
          codeIndex: i,
        });
        return { success: true };
      }
    }

    return { success: false, error: "Invalid verification code" };
  },
});
