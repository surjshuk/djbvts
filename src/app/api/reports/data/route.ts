import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { ensureUserByEmail } from "../../../../lib/users";

type ParsedRow = {
  vehicleNo: string;
  area: string;
  tankerType: string;
  transporterName: string;
  reportDate: string; // ISO (YYYY-MM-DD)
  tripDistanceKm: string;
  tripCount: number;
};

const KM_MATCHER = /[-+]?[0-9]*\.?[0-9]+/;
const UPSERT_BATCH_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function normaliseDate(input: unknown): string | null {
  if (!input) return null;

  if (input instanceof Date && !Number.isNaN(input.valueOf())) {
    return input.toISOString().split("T")[0];
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Summary rows contain a range like "01-07-2025 - 31-07-2025"
  if (raw.includes(" - ")) {
    return null;
  }

  // Excel may serialise dates as numbers
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && raw.length <= 5) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + asNumber * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  }

  const segments = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (segments) {
    const day = segments[1].padStart(2, "0");
    const month = segments[2].padStart(2, "0");
    let year = segments[3];
    if (year.length === 2) {
      year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Attempt native parsing as fallback
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

function toDistanceString(value: unknown): string {
  if (value === null || value === undefined) return "0 km";
  const raw = String(value);
  const match = raw.match(KM_MATCHER);
  if (!match) return "0 km";
  const num = Number.parseFloat(match[0]);
  if (Number.isNaN(num)) return "0 km";
  return `${num.toFixed(2)} km`;
}

function toTripCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = Number.parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(num) ? 0 : num;
}

async function parseWorkbook(file: File): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const buffer = Buffer.from(await file.arrayBuffer());

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) {
    throw new Error("No worksheet found in uploaded file");
  }

  const table = XLSX.utils.sheet_to_json<(string | number | Date)[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const findColumn = (headers: string[], candidates: string[]) => {
    for (const candidate of candidates) {
      const idx = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(candidate));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const getCell = (row: string[], index: number) => {
    if (index < 0 || index >= row.length) return "";
    return row[index];
  };

  const records: ParsedRow[] = [];

  let headerRow: string[] | null = null;
  let headerIndex = -1;
  let columnIndex: {
    vehicle: number;
    area: number;
    tankerType: number;
    transporter: number;
    reportDate: number;
    distance: number;
    tripCount: number;
  } | null = null;

  let context: {
    vehicleNo: string;
    area: string;
    tankerType: string;
    transporterName: string;
  } | null = null;

  for (let rowIndex = 0; rowIndex < table.length; rowIndex += 1) {
    const rawRow = table[rowIndex];
    const row = rawRow.map((value) => String(value ?? "").trim());

    if (!headerRow) {
      const joined = row.map((cell) => normalizeHeader(cell));
      if (joined.includes(normalizeHeader("Vehicle No")) && joined.includes(normalizeHeader("Report Date"))) {
        headerRow = row;
        headerIndex = rowIndex;
        columnIndex = {
          vehicle: findColumn(row, ["Vehicle No.", "Vehicle No", "Vehicle Number"]),
          area: findColumn(row, ["Area"]),
          tankerType: findColumn(row, ["Tanker Type", "Type"]),
          transporter: findColumn(row, ["Transporter Name", "Transporter"]),
          reportDate: findColumn(row, ["Report Date", "Date"]),
          distance: findColumn(row, ["Trip Distance / Engine Hr", "Trip Distance / Engine", "Trip Distance", "Distance"]),
          tripCount: findColumn(row, ["Trip Count", "Trips", "Trip"]),
        };

        // If "Trip Count" is not found, fall back to last column.
        if (columnIndex.tripCount === -1) {
          columnIndex.tripCount = row.length - 1;
        }
        continue;
      }
      continue;
    }

    if (rowIndex <= headerIndex) {
      continue;
    }

    if (row.every((cell) => cell === "")) {
      continue;
    }

    if (!columnIndex) {
      continue;
    }

    const reportDateRaw = columnIndex.reportDate !== -1 ? row[columnIndex.reportDate] : "";

    // Skip repeated header rows that appear in grouped sections
    if (normalizeHeader(reportDateRaw) === normalizeHeader("Report Date")) {
      continue;
    }

    const hasRange = typeof reportDateRaw === "string" && reportDateRaw.includes(" - ");
    if (hasRange) {
      context = {
        vehicleNo: getCell(row, columnIndex.vehicle),
        area: getCell(row, columnIndex.area),
        tankerType: getCell(row, columnIndex.tankerType),
        transporterName: getCell(row, columnIndex.transporter),
      };

      // Summary rows sometimes include totals for distance/trips; ignore the actual numerics.
      continue;
    }

    const reportDate = normaliseDate(reportDateRaw);
    if (!reportDate) {
      continue;
    }

    const vehicleNo = getCell(row, columnIndex.vehicle) || context?.vehicleNo || "";
    const area = getCell(row, columnIndex.area) || context?.area || "";
    const tankerType = getCell(row, columnIndex.tankerType) || context?.tankerType || "";
    const transporterName = getCell(row, columnIndex.transporter) || context?.transporterName || "";

    if (!vehicleNo) {
      continue;
    }

    records.push({
      vehicleNo,
      area,
      tankerType,
      transporterName,
      reportDate,
      tripDistanceKm: toDistanceString(getCell(row, columnIndex.distance)),
      tripCount: toTripCount(getCell(row, columnIndex.tripCount)),
    });
  }

  return records;
}

export async function GET(_req: NextRequest) {
  const records = await prisma.report.findMany({
    orderBy: [
      { vehicleNo: "asc" },
      { reportDate: "asc" },
    ],
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = await req.json();
      const { records: rawRecords, record: singleRecord, uploadedBy } = payload;
      if (!uploadedBy) {
        return NextResponse.json({ error: "uploadedBy is required" }, { status: 400 });
      }

      const uploaderEmail = await ensureUserByEmail(uploadedBy);

      if (singleRecord) {
        const normalizedRecord: ParsedRow = {
          vehicleNo: String(singleRecord.vehicleNo ?? "").trim(),
          area: String(singleRecord.area ?? "").trim(),
          tankerType: String(singleRecord.tankerType ?? "").trim(),
          transporterName: String(singleRecord.transporterName ?? "").trim(),
          reportDate: normaliseDate(singleRecord.reportDate) ?? "",
          tripDistanceKm: toDistanceString(singleRecord.tripDistanceKm),
          tripCount: toTripCount(singleRecord.tripCount),
        };

        if (!normalizedRecord.vehicleNo) {
          return NextResponse.json({ error: "vehicleNo is required" }, { status: 400 });
        }

        if (!normalizedRecord.reportDate) {
          return NextResponse.json({ error: "Valid reportDate is required" }, { status: 400 });
        }

        const snapshotCode = `manual-${randomBytes(8).toString("hex")}`;
        const now = new Date();

        const [, created] = await prisma.$transaction([
          prisma.uploadSnapshot.create({
            data: {
              snapshotCode,
              uploadedBy: uploaderEmail,
              recordCount: 1,
              fileName: "manual-entry",
              uploadedAt: now,
            },
          }),
          prisma.report.create({
            data: {
              ...normalizedRecord,
              snapshotCode,
              uploadedBy: uploaderEmail,
              uploadedAt: now,
            },
          }),
        ]);

        return NextResponse.json({ success: true, record: created });
      }

      if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
        return NextResponse.json({ error: "No records provided" }, { status: 400 });
      }

      const snapshotCode = randomBytes(16).toString("hex");

      const rows: ParsedRow[] = rawRecords
        .map((r: ParsedRow) => ({
          ...r,
          reportDate: normaliseDate(r.reportDate) ?? "",
          tripDistanceKm: toDistanceString(r.tripDistanceKm),
          tripCount: toTripCount(r.tripCount),
        }))
        .filter((r) => r.reportDate);

      if (rows.length === 0) {
        return NextResponse.json({ error: "No valid rows to save" }, { status: 400 });
      }

      const savedRows = await persistRows(rows, uploaderEmail, snapshotCode, null);
      return NextResponse.json({
        success: true,
        snapshotCode,
        recordCount: rows.length,
        records: savedRows,
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const uploadedBy = formData.get("uploadedBy");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing XLSX file" }, { status: 400 });
    }

    if (typeof uploadedBy !== "string" || !uploadedBy.trim()) {
      return NextResponse.json({ error: "uploadedBy is required" }, { status: 400 });
    }

    const parsedRows = await parseWorkbook(file);
    if (parsedRows.length === 0) {
      return NextResponse.json({ error: "No data rows detected in worksheet" }, { status: 400 });
    }

    const snapshotCode = randomBytes(16).toString("hex");
    const fileName = file.name ?? "uploaded.xlsx";

    const uploaderEmail = await ensureUserByEmail(uploadedBy);
    const savedRows = await persistRows(parsedRows, uploaderEmail, snapshotCode, fileName);
    return NextResponse.json({
      success: true,
      snapshotCode,
      recordCount: parsedRows.length,
      records: savedRows,
    });
  } catch (error: any) {
    console.error("Failed to save data", error);
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    const message = status === 400 && error?.message ? error.message : "Failed to save data";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, record, updatedBy } = await req.json();

    if (!id || !record) {
      return NextResponse.json({ error: "id and record are required" }, { status: 400 });
    }

    const existing = await prisma.report.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const updaterEmail = updatedBy ? await ensureUserByEmail(updatedBy) : existing.uploadedBy;
    const nextReportDate = normaliseDate(record.reportDate ?? existing.reportDate);
    if (!nextReportDate) {
      return NextResponse.json({ error: "Valid reportDate is required" }, { status: 400 });
    }

    const updateData = {
      vehicleNo: String(record.vehicleNo ?? existing.vehicleNo).trim(),
      area: String(record.area ?? existing.area).trim(),
      tankerType: String(record.tankerType ?? existing.tankerType).trim(),
      transporterName: String(record.transporterName ?? existing.transporterName).trim(),
      reportDate: nextReportDate,
      tripDistanceKm: toDistanceString(record.tripDistanceKm ?? existing.tripDistanceKm),
      tripCount: toTripCount(record.tripCount ?? existing.tripCount),
      uploadedBy: updaterEmail,
      uploadedAt: new Date(),
    };

    const updatedRecord = await prisma.report.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, record: updatedRecord });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A report already exists for the selected vehicle and date" },
        { status: 409 }
      );
    }
    console.error("Failed to update report", error);
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    const message = status === 400 && error?.message ? error.message : "Failed to update report";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await prisma.report.delete({ where: { id } });
    return NextResponse.json({ success: true, record: deleted });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    console.error("Failed to delete report", error);
    const status = typeof error?.statusCode === "number" ? error.statusCode : 500;
    const message = status === 400 && error?.message ? error.message : "Failed to delete report";
    return NextResponse.json({ error: message }, { status });
  }
}

async function persistRows(rows: ParsedRow[], uploaderEmail: string, snapshotCode: string, fileName: string | null) {
  const now = new Date();
  const dataRows = rows.map((row) => ({
    ...row,
    snapshotCode,
    uploadedBy: uploaderEmail,
  }));

  const batches = chunkArray(dataRows, UPSERT_BATCH_SIZE);

  if (batches.length === 0) {
    return [];
  }

  const firstBatchOps = batches.shift()?.map((record) =>
    prisma.report.upsert({
      where: {
        vehicleNo_reportDate: {
          vehicleNo: record.vehicleNo,
          reportDate: record.reportDate,
        },
      },
      update: {
        area: record.area,
        tankerType: record.tankerType,
        transporterName: record.transporterName,
        tripDistanceKm: record.tripDistanceKm,
        tripCount: record.tripCount,
        snapshotCode,
        uploadedBy: uploaderEmail,
        uploadedAt: now,
      },
      create: {
        ...record,
        uploadedBy: uploaderEmail,
        uploadedAt: now,
      },
    })
  ) ?? [];

  await prisma.$transaction([
    prisma.uploadSnapshot.create({
      data: {
        snapshotCode,
        uploadedBy: uploaderEmail,
        recordCount: dataRows.length,
        fileName: fileName ?? null,
        uploadedAt: now,
      },
    }),
    ...firstBatchOps,
  ]);

  for (const batch of batches) {
    const operations = batch.map((record) =>
      prisma.report.upsert({
        where: {
          vehicleNo_reportDate: {
            vehicleNo: record.vehicleNo,
            reportDate: record.reportDate,
          },
        },
        update: {
          area: record.area,
          tankerType: record.tankerType,
          transporterName: record.transporterName,
          tripDistanceKm: record.tripDistanceKm,
          tripCount: record.tripCount,
          snapshotCode,
          uploadedBy: uploaderEmail,
          uploadedAt: now,
        },
        create: {
          ...record,
          uploadedBy: uploaderEmail,
          uploadedAt: now,
        },
      })
    );

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }
  }

  const refreshed = await prisma.report.findMany({
    orderBy: [
      { vehicleNo: "asc" },
      { reportDate: "asc" },
    ],
  });

  return refreshed;
}
