import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../../lib/prisma";

const KM_MATCHER = /[-+]?[0-9]*\.?[0-9]+/;

function parseDistance(value: string | null | undefined): number {
  if (!value) return 0;
  const match = value.match(KM_MATCHER);
  if (!match) return 0;
  const num = Number.parseFloat(match[0]);
  return Number.isNaN(num) ? 0 : num;
}

function buildWhereClause({
  dateFrom,
  dateTo,
  filterVehicle,
  filterArea,
  filterMonth,
}: {
  dateFrom: string;
  dateTo: string;
  filterVehicle: string | null;
  filterArea: string | null;
  filterMonth: string | null;
}): Prisma.ReportWhereInput {
  const clauses: Prisma.ReportWhereInput[] = [
    { reportDate: { gte: dateFrom } },
    { reportDate: { lte: dateTo } },
  ];

  const vehicleFilters =
    filterVehicle && filterVehicle !== "all"
      ? filterVehicle.split(",").map((token) => token.trim()).filter(Boolean)
      : [];

  if (vehicleFilters.length > 0) {
    clauses.push({ vehicleNo: { in: vehicleFilters } });
  }

  if (filterArea && filterArea !== "all") {
    clauses.push({ area: filterArea });
  }

  const monthFilters =
    filterMonth && filterMonth !== "all"
      ? filterMonth.split(",").map((token) => token.trim()).filter(Boolean)
      : [];

  if (monthFilters.length > 0) {
    clauses.push({
      OR: monthFilters.map((month) => ({
        reportDate: { startsWith: `${month}-` },
      })),
    });
  }

  return { AND: clauses };
}

type SummaryVehicleReport = {
  vehicleNumber: string;
  area: string;
  tankerType: string;
  transporterName: string;
  totalDistance: number;
  totalTrips: number;
  vehicleRecalculateCount: number;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (!code) {
    return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
  }

  const record = await prisma.pdfGeneration.findUnique({
    where: { verificationCode: code },
    select: {
      verificationCode: true,
      dateFrom: true,
      dateTo: true,
      generatedAt: true,
      generatedBy: true,
      filterVehicle: true,
      filterArea: true,
      filterMonth: true,
      summaryVehicleReports: true,
      summaryTotalDistance: true,
      summaryTotalTrips: true,
      summaryVehicleCount: true,
      summaryGeneratedAt: true,
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let vehicleReports: SummaryVehicleReport[] = [];
  let totalDistance = 0;
  let totalTrips = 0;
  let totalVehicleReports = 0;

  if (Array.isArray(record.summaryVehicleReports) && record.summaryVehicleReports.length > 0) {
    vehicleReports = record.summaryVehicleReports as SummaryVehicleReport[];
    totalDistance = record.summaryTotalDistance ?? vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalDistance, 0);
    totalTrips = record.summaryTotalTrips ?? vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalTrips, 0);
    totalVehicleReports = record.summaryVehicleCount ?? vehicleReports.length;
  } else {
    const where = buildWhereClause(record);
    const reports = await prisma.report.findMany({
      where,
      orderBy: [
        { vehicleNo: "asc" },
        { reportDate: "asc" },
      ],
    });

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

    for (const row of reports) {
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

    vehicleReports = Array.from(vehicleMap.entries()).map(([vehicleNumber, entry]) => ({
      vehicleNumber,
      area: entry.area,
      tankerType: entry.tankerType,
      transporterName: entry.transporterName,
      totalDistance: entry.totalDistance,
      totalTrips: entry.totalTrips,
      vehicleRecalculateCount: 0,
    }));

    totalDistance = vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalDistance, 0);
    totalTrips = vehicleReports.reduce((sum, vehicle) => sum + vehicle.totalTrips, 0);
    totalVehicleReports = vehicleReports.length;
  }

  return NextResponse.json({
    success: true,
    data: {
      verificationCode: code,
      fromDate: record.dateFrom,
      toDate: record.dateTo,
      generationTime: record.summaryGeneratedAt ?? record.generatedAt,
      generatedBy: record.generatedBy,
      totalDistance,
      totalTrips,
      totalVehicleReports,
      vehicleReports,
      filters: {
        vehicle: record.filterVehicle ?? "all",
        area: record.filterArea ?? "all",
        month: record.filterMonth ?? "all",
      },
      downloadUrl: `/api/reports/pdf/${code}`,
    },
  });
}
