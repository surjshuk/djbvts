// src/lib/report-pdf.ts
import QRCode from "qrcode";

// convert mm → pt (1 inch = 25.4 mm, 1 inch = 72 pt)
const mmToPt = (mm: number) => (mm * 72) / 25.4;

// Your custom page size: 297 × 241 mm
const PAGE_WIDTH_PT  = mmToPt(297); // ≈ 841.89 pt
const PAGE_HEIGHT_PT = mmToPt(281); // ≈ 683.15 pt

type Row = {
  area: string;
  vehicleNo: string;
  tankerType: string;
  transporterName: string;
  reportDate: string;
  tripDistanceKm: string;
  tripCount: number;
};

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

  // set custom size (portrait). For landscape, swap width/height.
  const doc = new PDFDocument({
    size: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT],
    margin: 24,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = PAGE_WIDTH_PT - doc.page.margins.right;
  const centerX = PAGE_WIDTH_PT / 2;

  // Generated at timestamp
  const genTime = generatedAt.toTimeString().slice(0, 8);
  doc.fontSize(9).fillColor("#000")
    .text(
      `System Generated Report, Generated at: ${fmtDate(generatedAt)} ${genTime}`,
      { align: "center" }
    )
    .moveDown(0.1);

  // Capture headerY after the timestamp
  const headerY = doc.y;

  // Calculate heights for vertical centering
  const logoWidth = 100;
  const logoHeight = 30; // Adjust based on your logo's aspect ratio
  const qrSize = 80;
  const qrWithTextHeight = qrSize + 2 + 10; // QR + spacing + text height
  const titleHeight = 20; // Approximate height for title text
  
  // Find the tallest element
  const maxHeight = Math.max(titleHeight, logoHeight, qrWithTextHeight);
  
  // Calculate vertical offsets to center each element
  const titleOffset = (maxHeight - titleHeight) / 2;
  const logoOffset = (maxHeight - logoHeight) / 2;
  const qrOffset = (maxHeight - qrWithTextHeight) / 2;
  
  // Left: Title and Date range
  doc.fontSize(9).font('Helvetica').fillColor("#000")
    .text(title, left, headerY + titleOffset, { continued: true })
    .fontSize(9).font('Helvetica')
    .text(` (From: ${fmtDate(dateFrom)} To: ${fmtDate(dateTo)} )`, { width: 300 });
  
  // Center: Logo from public folder
  const logoPath = process.cwd() + '/public/image.png';
  doc.image(logoPath, centerX - logoWidth / 2, headerY + logoOffset, { width: logoWidth });
  
  // Right: QR code with "Scan for report details" below
  const qrX = right - qrSize;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 200 });
  const qrBuf = Buffer.from(qrDataUrl.split(",")[1], "base64");
  doc.image(qrBuf, qrX, headerY + qrOffset, { width: qrSize });
  
  // "Scan for report details" below QR
  doc.fontSize(7).fillColor("#666")
    .text("Scan for report details", qrX - 10, headerY + qrOffset + qrSize + 2, { width: qrSize + 20, align: "center" });
  
  // Move down past the header section
  doc.y = headerY + maxHeight + 10;
  doc.moveDown(0.5);
  
  


  // Table layout
  const tableWidth = right - left;

  const cols = [
    { label: "S.No", width: 40 },
    { label: "Area", width: 80 },
    { label: "Vehicle No.", width: 100 },
    { label: "Tanker Type", width: 100 },
    { label: "Transporter Name", width: 120 },
    { label: "Report Date", width: 150 },
    { label: "Trip Distance / Engine Hr", width: 150 },
    { label: "Trip Count", width: 70 },
  ];

  // Draw header row with light gray background
  let y = doc.y;
  const headerHeight = 20;
  
  doc.save()
    .rect(left, y, tableWidth, headerHeight)
    .fill("#2880ba");

  // Column titles in white, bold
  doc.fillColor("#fff").fontSize(8).font('Helvetica-Bold');
  let x = left + 3;
  for (const c of cols) {
    doc.text(c.label, x, y + 5, { width: c.width - 6, align: "left" });
    x += c.width;
  }
  doc.restore();

  // Sub-header row (lighter color) - shows totals
  y += headerHeight;
  const subHeaderHeight = 20;
  doc.save()
    .rect(left, y, tableWidth, subHeaderHeight)
    .fill("#babae8"); // Lighter blue than header

  doc.fillColor("#000").fontSize(8).font('Helvetica-Bold');
  
  // Calculate total km from all rows
  const totalKm = rows.reduce((sum, r) => sum + parseFloat(r.tripDistanceKm), 0).toFixed(2);
  
  x = left + 3;
  const subHeaderCells = [
    "", // S.No
    rows[0]?.area || "", // Area (from first row)
    rows[0]?.vehicleNo || "", // Vehicle No
    rows[0]?.tankerType || "", // Tanker Type
    rows[0]?.transporterName || "", // Transporter Name
    `${fmtDate(dateFrom)} - ${fmtDate(dateTo)}`, // Date range
    `${totalKm} km`, // Total distance
    String(rows.length), // Total trip count
  ];
  
  subHeaderCells.forEach((val, idx) => {
    const w = cols[idx].width;
    doc.text(val, x, y + 5, { width: w - 6, align: "left" });
    x += w;
  });
  doc.restore();

  // Body rows with alternating colors
  y += subHeaderHeight;
  doc.fontSize(8).font('Helvetica');
  
  rows.forEach((r, i) => {
    const rowHeight = 18;
    
    // Alternate row background: white and light gray
    const bgColor = i % 2 === 0 ? "#ffffff" : "#f5f5f5";
    doc.save()
      .rect(left, y, tableWidth, rowHeight)
      .fill(bgColor);
    doc.restore();
    
    // Text color
    doc.fillColor("#000");
    
    x = left + 3;
    const cells = [
      String(i + 1),
      r.area,
      r.vehicleNo,
      r.tankerType,
      r.transporterName,
      r.reportDate,
      r.tripDistanceKm,
      String(r.tripCount),
    ];
    
    cells.forEach((val, idx) => {
      const w = cols[idx].width;
      doc.text(val, x, y + 5, { width: w - 6, align: "left", lineBreak: false });
      x += w;
    });
    
    y += rowHeight;
  });

  // QR footer
  const footerY = PAGE_HEIGHT_PT - doc.page.margins.bottom - 60;
    
  const genTimeFooter = generatedAt.toTimeString().slice(0, 8);
  doc.fontSize(8).font('Helvetica').fillColor("#000")
    .text(
      `Generated by :- ${generatedByEmail} , Report Generated At :- ${fmtDate(generatedAt)} ${genTimeFooter}`,
      left,
      footerY + 15,
      { width: tableWidth - 60 }
    );
  
  // Page number
  doc.text(
    `Page 1 of 1`,
    right - 60,
    footerY + 15,
    { width: 60, align: "right" }
  );

  doc.end();
  return done;
}
