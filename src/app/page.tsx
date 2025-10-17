"use client";
import { useState } from "react";

export default function ReportsPage() {
  const [creating, setCreating] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState(null);

  async function generate() {
    try {
      setCreating(true);
      setVerificationUrl(null);

      // 1) Ask backend to create the report from DB data
      const createRes = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: "2025-10-14",
          dateTo: "2025-10-14",
          generatedByEmail: "vinaysaroha2@gmail.com",
        }),
        cache: "no-store",
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData?.message || "Create failed");

      setVerificationUrl(createData.verificationUrl);

      // 2) Download the PDF binary WITHOUT navigating away
      const pdfRes = await fetch(createData.pdfUrl, { cache: "no-store" });
      if (!pdfRes.ok) throw new Error("PDF generation failed");

      // Try to read filename from Content-Disposition; fallback if missing
      const disp = pdfRes.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(disp);
      const filename = match?.[1] || "report.pdf";

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename; // makes it download into default Downloads folder
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to generate");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Daily Distance Reports</h1>

      <button
        onClick={generate}
        disabled={creating}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
      >
        {creating ? "Generating…" : "Generate & Download PDF"}
      </button>

      {verificationUrl && (
        <p className="mt-4">
          Verification URL (the QR in the PDF points here):{" "}
          <a className="text-blue-600 underline" href={verificationUrl} target="_blank">
            {verificationUrl}
          </a>
        </p>
      )}
    </main>
  );
}
