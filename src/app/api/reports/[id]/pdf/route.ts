// src/app/api/reports/[id]/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { buildReportPdf } from "../../../../../lib/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;                             // ← await it

  const report = await prisma.report.findUnique({
    where: { id },
    include: { rows: true },
  });
  if (!report) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const verificationUrl = `${base}/verify/${report.verificationSlug}`;

  const buffer = await buildReportPdf({
    title: report.title,
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    generatedAt: report.generatedAt,
    generatedByEmail: report.generatedByEmail,
    verificationUrl,
    rows: report.rows.map(r => ({
      area: r.area,
      vehicleNo: r.vehicleNo,
      tankerType: r.tankerType,
      transporterName: r.transporterName,
      tripDistanceKm: r.tripDistanceKm.toString(),
      engineHours: r.engineHours.toString(),
      tripCount: r.tripCount,
    })),
  });

  const day = report.dateFrom.toISOString().slice(0,10);
  const filename = `DailyDistanceReport(${day}).pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },  
  });
}
