import { VerificationRequestForm } from "@/components/settings/verification-request-form";

export const metadata = {
  title: "Verification",
  description: "Request verification for your account",
};

export default function VerificationPage() {
  return (
    <div className="feed-container">
      <div className="p-4">
        <VerificationRequestForm />
      </div>
    </div>
  );
}
