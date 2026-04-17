import { MediaVaultWithFolders } from "@/components/vault/media-vault-with-folders";

export const metadata = {
  title: "Media Vault",
  description: "Your media library",
};

export default function VaultPage() {
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <MediaVaultWithFolders />
    </div>
  );
}
