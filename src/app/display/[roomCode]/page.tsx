"use client";

import { Suspense } from "react";
import DisplayPageContent from "./display-page-content";

export default function DisplayPage() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-[#080706]" />}>
      <DisplayPageContent />
    </Suspense>
  );
}
