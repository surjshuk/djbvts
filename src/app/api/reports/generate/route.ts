import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { buildReportPdf } from "../../../../lib/report-pdf";
import { ensureUserByEmail } from "../../../../lib/users";

const KM_MATCHER = /[-+]?[0-9]*\.?[0-9]+/;

type Filters = {
  vehicle?: string;
  vehicles?: string[];
  area?: string | string[];
  month?: string;
  months?: string[];
};

type NormalizedFilters = {
  vehicles: string[];
  area: string | null;
  months: string[];
};

function normalizeFilters(filters: Filters = {} as Filters): NormalizedFilters {
  const vehicleArray = Array.isArray(filters.vehicles)
    ? filters.vehicles
    : filters.vehicle && filters.vehicle !== "all"
      ? [filters.vehicle]
      : [];

  const monthArray = Array.isArray(filters.months)
    ? filters.months
    : filters.month && filters.month !== "all"
      ? [filters.month]
      : [];

  const areaValue = Array.isArray(filters.area)
    ? filters.area[0] ?? null
    : filters.area && filters.area !== "all"
      ? filters.area
      : null;

  const uniqueVehicles = Array.from(new Set(vehicleArray.filter(Boolean)));
  const uniqueMonths = Array.from(new Set(monthArray.filter(Boolean)));

  return {
    vehicles: uniqueVehicles,
    area: areaValue,
    months: uniqueMonths,
  };
}

function parseDistance(value: string | null | undefined): number {
  if (!value) return 0;
  const match = value.match(KM_MATCHER);
  if (!match) return 0;
  const num = Number.parseFloat(match[0]);
  return Number.isNaN(num) ? 0 : num;
}

function buildSummary(rows: Array<{
  vehicleNo: string;
  area: string;
  tankerType: string;
  transporterName: string;
  tripDistanceKm: string | null;
  tripCount: number | null;
}>) {
  const vehicleMap = new Map<
    string,
    {
      area: string;
      tankerType: string;
      transporterName: string;
      totalDistance: number;
      totalTrips: number;
    }
  >();

  for (const row of rows) {
    const key = row.vehicleNo;
    const entry = vehicleMap.get(key) ?? {
      area: row.area,
      tankerType: row.tankerType,
      transporterName: row.transporterName,
      totalDistance: 0,
      totalTrips: 0,
    };

    entry.totalDistance += parseDistance(row.tripDistanceKm ?? "0");
    entry.totalTrips += row.tripCount ?? 0;

    vehicleMap.set(key, entry);
  }

  const vehicleReports = Array.from(vehicleMap.entries()).map(([vehicleNumber, entry]) => ({
    vehicleNumber,
    area: entry.area,
    tankerType: entry.tankerType,
    transporterName: entry.transporterName,
    totalDistance: Number(entry.totalDistance.toFixed(2)),
    totalTrips: entry.totalTrips,
    vehicleRecalculateCount: 0,
  }));

  const totalDistance = vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalDistance, 0);
  const totalTrips = vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalTrips, 0);

  return {
    vehicleReports,
    totalDistance: Number(totalDistance.toFixed(2)),
    totalTrips,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { dateFrom, dateTo, generatedByEmail, filters = {} as Filters } = await req.json();
    const normalizedFilters = normalizeFilters(filters);

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom and dateTo are required" }, { status: 400 });
    }

    if (!generatedByEmail) {
      return NextResponse.json({ error: "generatedByEmail is required" }, { status: 400 });
    }

    const generatorEmail = await ensureUserByEmail(generatedByEmail);

    const where = buildWhereClause(dateFrom, dateTo, normalizedFilters);

    const rows = await prisma.report.findMany({
      where,
      orderBy: [
        { vehicleNo: "asc" },
        { reportDate: "asc" },
      ],
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "No records match the selected filters" }, { status: 404 });
    }

    const generatedAt = new Date();
    const verificationCode = randomBytes(8).toString("hex");
    const reportCardEnv = (process.env.REPORT_CARD_URL ?? process.env.NEXT_PUBLIC_REPORT_CARD_URL ?? "")
      .trim()
      .replace(/\/$/, "");

    const defaultReportCard = process.env.NODE_ENV === "production"
      ? "https://djbvtswatsoo.com/report-card.html"
      : "http://localhost:3000/report-card.html";

    const reportCardBase = (reportCardEnv || defaultReportCard).replace(/\/$/, "");

    const verificationUrl = `${reportCardBase}?code=${encodeURIComponent(verificationCode)}`;

    const pdfBuffer = await buildReportPdf({
      title: "Daily Distance Report",
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      generatedAt,
      generatedByEmail: generatorEmail,
      rows,
      verificationUrl,
    });

    const pdfBase64 = pdfBuffer.toString("base64");
    const summary = buildSummary(rows);

    const createPayload: Prisma.PdfGenerationUncheckedCreateInput = {
      verificationCode,
      verificationUrl,
      dateFrom,
      dateTo,
      generatedBy: generatorEmail,
      generatedAt,
      filterVehicle: normalizedFilters.vehicles.length
        ? normalizedFilters.vehicles.join(", ")
        : null,
      filterArea: normalizedFilters.area,
      filterMonth: normalizedFilters.months.length
        ? normalizedFilters.months.join(", ")
        : null,
      pdfBase64,
      recordCount: rows.length,
      summaryVehicleReports: summary.vehicleReports,
      summaryTotalDistance: summary.totalDistance,
      summaryTotalTrips: summary.totalTrips,
      summaryVehicleCount: summary.vehicleReports.length,
      summaryGeneratedAt: generatedAt,
    };

    await prisma.pdfGeneration.create({ data: createPayload });

    return NextResponse.json({
      success: true,
      pdfUrl: `/api/reports/pdf/${verificationCode}`,
      verificationUrl,
      verificationCode,
      recordCount: rows.length,
    });
  } catch (error: any) {
    console.error("Failed to generate PDF", error);
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    const message = status === 400 && error?.message ? error.message : "Failed to generate PDF";
    return NextResponse.json({ error: message }, { status });
  }
}

function buildWhereClause(dateFrom: string, dateTo: string, filters: NormalizedFilters): Prisma.ReportWhereInput {
  const clauses: Prisma.ReportWhereInput[] = [
    { reportDate: { gte: dateFrom } },
    { reportDate: { lte: dateTo } },
  ];

  if (filters.vehicles.length > 0) {
    clauses.push({ vehicleNo: { in: filters.vehicles } });
  }

  if (filters.area) {
    clauses.push({ area: filters.area });
  }

  if (filters.months.length > 0) {
    clauses.push({
      OR: filters.months.map((month) => ({
        reportDate: { startsWith: `${month}-` },
      })),
    });
  }

  return { AND: clauses };
}
