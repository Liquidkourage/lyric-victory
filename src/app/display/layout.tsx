import type { Viewport } from "next";
import { DisplayKioskShell } from "@/components/display-kiosk-shell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <DisplayKioskShell>{children}</DisplayKioskShell>;
}
