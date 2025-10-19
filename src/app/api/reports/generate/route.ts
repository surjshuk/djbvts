import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { buildReportPdf } from "../../../../lib/report-pdf";
import { ensureUserByEmail } from "../../../../lib/users";

type Filters = {
  vehicle?: string;
  area?: string;
  month?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { dateFrom, dateTo, generatedByEmail, filters = {} as Filters } = await req.json();

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom and dateTo are required" }, { status: 400 });
    }

    if (!generatedByEmail) {
      return NextResponse.json({ error: "generatedByEmail is required" }, { status: 400 });
    }

    const generatorEmail = await ensureUserByEmail(generatedByEmail);

    const where = buildWhereClause(dateFrom, dateTo, filters);

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

    await prisma.pdfGeneration.create({
      data: {
        verificationCode,
        verificationUrl,
        dateFrom,
        dateTo,
        generatedBy: generatorEmail,
        generatedAt,
        filterVehicle: filters.vehicle && filters.vehicle !== "all" ? filters.vehicle : null,
        filterArea: filters.area && filters.area !== "all" ? filters.area : null,
        filterMonth: filters.month && filters.month !== "all" ? filters.month : null,
        pdfBase64,
        recordCount: rows.length,
      },
    });

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

function buildWhereClause(dateFrom: string, dateTo: string, filters: Filters): Prisma.ReportWhereInput {
  const clauses: Prisma.ReportWhereInput[] = [
    { reportDate: { gte: dateFrom } },
    { reportDate: { lte: dateTo } },
  ];

  if (filters.vehicle && filters.vehicle !== "all") {
    clauses.push({ vehicleNo: filters.vehicle });
  }

  if (filters.area && filters.area !== "all") {
    clauses.push({ area: filters.area });
  }

  if (filters.month && filters.month !== "all") {
    clauses.push({ reportDate: { startsWith: `${filters.month}-` } });
  }

  return { AND: clauses };
}
