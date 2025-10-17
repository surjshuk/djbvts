import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";  

// Replace this with your real DB aggregation
async function composeRows(dateFrom: Date, dateTo: Date) {
  // TODO: pull real rows from your tables; return array of row-shaped objects
  return [
    {
      area: "Rohini 23(MS)",
      vehicleNo: "DL1LAL5453",
      tankerType: "MS_HIRED",
      transporterName: "DJB MS",
      tripDistanceKm: "0.00",
      engineHours: "0.00",
      tripCount: 0,
    },
  ];
}

function slug() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dateFrom = body.dateFrom ? new Date(body.dateFrom) : new Date();
    const dateTo   = body.dateTo   ? new Date(body.dateTo)   : dateFrom;
    const email    = body.generatedByEmail ?? "reports@example.com";

    const rows = await composeRows(dateFrom, dateTo);

    const r = await prisma.report.create({
      data: {
        dateFrom, dateTo,
        generatedByEmail: email,
        verificationSlug: slug(),
        rows: { create: rows.map(x => ({
          area: x.area,
          vehicleNo: x.vehicleNo,
          tankerType: x.tankerType,
          transporterName: x.transporterName,
          tripDistanceKm: x.tripDistanceKm,
          engineHours: x.engineHours,
          tripCount: x.tripCount,
        })) },
      },
    });

    const pdfUrl = `/api/reports/${r.id}/pdf`;
    const verificationUrl = `/verify/${r.verificationSlug}`;
    return NextResponse.json({ id: r.id, pdfUrl, verificationUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Failed to create report" }, { status: 500 });
  }
}
