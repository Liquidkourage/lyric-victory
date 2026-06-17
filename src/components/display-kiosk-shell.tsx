"use client";

import { useDisplayKiosk } from "@/hooks/useDisplayKiosk";

export function DisplayKioskShell({ children }: { children: React.ReactNode }) {
  useDisplayKiosk();

  return (
    <div
      className="display-stage display-kiosk fixed inset-0 overflow-hidden text-[clamp(20px,1.35vw,26px)] select-none"
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
