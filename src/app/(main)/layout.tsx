import { AppShell } from "@/components/navigation/app-shell";
import { ReactNode } from "react";

export default function MainLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
