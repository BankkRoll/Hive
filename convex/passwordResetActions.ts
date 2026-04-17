/**
 * @fileoverview Password Reset Actions Module
 *
 * Node.js runtime actions for sending password reset emails via Resend.
 *
 * Features:
 *   - Send password reset emails using Resend component
 *   - Styled HTML email templates
 *   - Token-based reset flow
 *
 * Security:
 *   - Always returns success to prevent email enumeration
 *   - Tokens expire in 1 hour
 */

"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { Resend } from "@convex-dev/resend";

const TOKEN_EXPIRY_HOURS = 1;

const resend = new Resend(components.resend, {
  testMode: false,
});

// ===== ACTIONS =====

/** Request password reset - sends email using Resend component */
export const requestReset = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(internal.passwordReset.createToken, {
      email: args.email,
    });

    if (!result.userId || !result.token) {
      return { success: true };
    }

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${result.token}`;
    const displayName = result.displayName || "there";

    await resend.sendEmail(ctx, {
      from: process.env.EMAIL_FROM || "noreply@example.com",
      to: args.email,
      subject: "Reset Your Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Reset Your Password</h2>
          <p>Hi ${displayName},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will expire in ${TOKEN_EXPIRY_HOURS} hour(s).
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="${resetUrl}" style="color: #7c3aed;">${resetUrl}</a>
          </p>
        </div>
      `,
    });

    return { success: true };
  },
});

/** Reset password action */
export const resetPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; reason?: string }> => {
    if (args.newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    const result = await ctx.runMutation(internal.passwordReset.useToken, {
      token: args.token,
    });

    if (!result.success) {
      return { success: false, reason: result.reason };
    }

    return { success: true };
  },
});
