import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (!code) {
    return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
  }

  const record = await prisma.pdfGeneration.findUnique({
    where: { verificationCode: code },
  });

  if (!record || !record.pdfBase64) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }

  const buffer = Buffer.from(record.pdfBase64, "base64");
  const filename = `report_${code}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}
