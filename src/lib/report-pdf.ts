// src/lib/report-pdf.ts
import { promises as fs } from "fs";
import QRCode from "qrcode";

// convert mm → pt (1 inch = 25.4 mm, 1 inch = 72 pt)
const mmToPt = (mm: number) => (mm * 72) / 25.4;

// Base custom page size: 297 × 241 mm
const PAGE_WIDTH_PT = mmToPt(297);
const BASE_PAGE_HEIGHT_PT = mmToPt(241);
const ROWS_PER_PAGE = 21;
const ROW_HEIGHT_PT = 18;
const FOOTER_GAP_PT = 6; // Change this gap to adjust spacing between table rows and footer

type Row = {
  area: string;
  vehicleNo: string;
  tankerType: string;
  transporterName: string;
  reportDate: string;
  tripDistanceKm: string;
  tripCount: number;
};

let cachedLogo: Buffer | null = null;

async function loadLogoBuffer(): Promise<Buffer> {
  if (cachedLogo) return cachedLogo;
  const fileUrl = new URL("./image.png", import.meta.url);
  cachedLogo = await fs.readFile(fileUrl);
  return cachedLogo;
}

function fmtDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

export async function buildReportPdf({
  title,
  dateFrom,
  dateTo,
  generatedAt,
  generatedByEmail,
  rows,
  verificationUrl,
}: {
  title: string;
  dateFrom: Date;
  dateTo: Date;
  generatedAt: Date;
  generatedByEmail: string;
  rows: Row[];
  verificationUrl: string;
}): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");

  const doc = new PDFDocument({
    size: [PAGE_WIDTH_PT, BASE_PAGE_HEIGHT_PT],
    margin: 20,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const columns = [
    { label: "S.No", width: 40 },
    { label: "Area", width: 80 },
    { label: "Vehicle No.", width: 100 },
    { label: "Tanker Type", width: 100 },
    { label: "Transporter Name", width: 120 },
    { label: "Report Date", width: 150 },
    { label: "Trip Distance / Engine Hr", width: 150 },
    { label: "Trip Count", width: 70 },
  ];

  const totalKm = rows.reduce((sum, r) => {
    const numericDistance = parseFloat(r.tripDistanceKm);
    return sum + (Number.isFinite(numericDistance) ? numericDistance : 0);
  }, 0).toFixed(2);

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const firstRow = rows[0];
  const logoBuffer = await loadLogoBuffer();
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 200 });
  const qrBuf = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const genTime = generatedAt.toTimeString().slice(0, 8);
  const genTimeFooter = genTime;

  const drawFirstPageHeader = () => {
    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;

    const headerY = doc.y;
    const logoWidth = 140;
    const logoHeight = 45;
    const stretchedLogoHeight = logoHeight * 1.5;
    const qrSize = 140;
    const qrWithTextHeight = qrSize + 2 + 10;
    const rangeStart = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
    const rangeEnd = new Date(dateTo.getFullYear(), dateTo.getMonth() + 1, 0);
    const titleLine = `${title} (From: ${fmtDate(rangeStart)} To: ${fmtDate(rangeEnd)} )`;

    doc.fontSize(12).font("Helvetica-Bold");
    const titleBlockHeight = doc.heightOfString(titleLine, { width: 300 });
    const leftBlockHeight = stretchedLogoHeight + 6 + titleBlockHeight;
    const headerHeight = Math.max(leftBlockHeight, qrWithTextHeight);

    const logoTop = headerY + headerHeight - leftBlockHeight + 17;
    const titleY = logoTop + stretchedLogoHeight + 6;
    doc.image(logoBuffer, left, logoTop, { width: logoWidth, height: stretchedLogoHeight });

    doc.fillColor("#000").text(titleLine, left, titleY, { width: 400 });

    const qrX = right - qrSize;
    const qrTop = headerY + headerHeight - qrWithTextHeight;
    doc.image(qrBuf, qrX, qrTop, { width: qrSize });

    doc.fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000")
      .text("Scan for report details", qrX - 15, qrTop + qrSize + 2, {
        width: qrSize + 20,
        align: "center",
      });

    const headerBottom = headerY + headerHeight;
    doc.y = headerBottom + 10;
    doc.moveDown(0.1);
  };

  const drawTableHeader = (left: number, tableWidth: number, includeSubHeader: boolean) => {
    let currentY = doc.y;
    const headerHeight = 20;
    doc.save().rect(left, currentY, tableWidth, headerHeight).fill("#2880ba");
    doc.restore();

    doc.fillColor("#fff").fontSize(8).font("Helvetica-Bold");
    let x = left + 3;
    for (const c of columns) {
      doc.text(c.label, x, currentY + 5, { width: c.width - 6, align: "left" });
      x += c.width;
    }
    currentY += headerHeight;
    doc.y = currentY;

    if (includeSubHeader) {
      const subHeaderHeight = 20;
      doc.save().rect(left, currentY, tableWidth, subHeaderHeight).fill("#babae8");
      doc.restore();

      doc.fillColor("#50525f").fontSize(8).font("Helvetica");
      const subHeaderCells = [
        "",
        firstRow?.area || "",
        firstRow?.vehicleNo || "",
        firstRow?.tankerType || "",
        firstRow?.transporterName || "",
        `${fmtDate(dateFrom)} - ${fmtDate(dateTo)}`,
        `${totalKm} km`,
        String(rows.length),
      ];

      x = left + 3;
      subHeaderCells.forEach((val, idx) => {
        const w = columns[idx].width;
        doc.text(val, x, currentY + 5, { width: w - 6, align: "left" });
        x += w;
      });

      currentY += subHeaderHeight;
      doc.y = currentY;
    }

    doc.fontSize(8).font("Helvetica");
  };

  const drawRows = (left: number, tableWidth: number, pageRows: Row[], startIndex: number) => {
    let currentY = doc.y;
    pageRows.forEach((row, offset) => {
      const globalIndex = startIndex + offset;
      const bgColor = globalIndex % 2 === 0 ? "#ffffff" : "#f5f5f5";
      doc.save().rect(left, currentY, tableWidth, ROW_HEIGHT_PT).fill(bgColor);
      doc.restore();

      doc.fillColor("#2c2c2c");
      let x = left + 3;
      const cells = [
        String(globalIndex + 1),
        row.area,
        row.vehicleNo,
        row.tankerType,
        row.transporterName,
        row.reportDate,
        row.tripDistanceKm,
        String(row.tripCount),
      ];

      cells.forEach((val, idx) => {
        const w = columns[idx].width;
        doc.text(val, x, currentY + 5, { width: w - 6, align: "left", lineBreak: false });
        x += w;
      });

      currentY += ROW_HEIGHT_PT;
    });
    doc.y = currentY;
  };

  const drawFooter = (left: number, right: number, tableWidth: number, pageNumber: number) => {
    const footerY = doc.page.height - doc.page.margins.bottom - 40

    doc.fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000")
      .text(
        `Generated by :- ${generatedByEmail} , Report Generated At :- ${fmtDate(generatedAt)} ${genTimeFooter}`,
        left,
        footerY,
        { width: tableWidth - 60 }
      );

    doc.text(`Page ${pageNumber} of ${totalPages}`, right - 60, footerY, {
      width: 60,
      align: "right",
    });
  };

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const isFirstPage = pageIndex === 0;

    if (pageIndex > 0) {
      doc.addPage({ size: [PAGE_WIDTH_PT, BASE_PAGE_HEIGHT_PT], margin: 24 });
    }

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const tableWidth = right - left;

    if (isFirstPage) {
      drawFirstPageHeader();
    } else {
      doc.y = doc.page.margins.top;
    }

    drawTableHeader(left, tableWidth, isFirstPage && rows.length > 0);

    const start = pageIndex * ROWS_PER_PAGE;
    const pageRows = rows.slice(start, start + ROWS_PER_PAGE);
    drawRows(left, tableWidth, pageRows, start);

    drawFooter(left, right, tableWidth, pageIndex + 1);
  }

  doc.end();
  return done;
}
