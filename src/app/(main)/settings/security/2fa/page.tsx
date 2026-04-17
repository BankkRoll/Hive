import { TwoFactorSettings } from "@/components/settings/two-factor-settings";

export const metadata = {
  title: "Two-Factor Authentication",
  description: "Set up two-factor authentication for your account",
};

export default function TwoFactorPage() {
  return <TwoFactorSettings />;
}
