'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';

type Row = Record<string, string | number>;

export default function CSVtoPDFPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual row state
  const [manualRow, setManualRow] = useState<Row>({});

  const hasData = rows.length > 0;

  const onFilesSelected = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setStatus('Parsing CSV...');
    Papa.parse<Row>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data || [];
        // Derive headers from union of keys across rows
        const cols = Array.from(
          parsed.reduce<Set<string>>((acc, r) => {
            Object.keys(r || {}).forEach((k) => acc.add(k));
            return acc;
          }, new Set<string>())
        );
        setHeaders(cols);
        setRows(parsed);
        // Init manual row with empty fields matching headers
        const mr: Row = {};
        cols.forEach((c) => (mr[c] = ''));
        setManualRow(mr);
        setStatus(`Loaded ${parsed.length} rows.`);
      },
      error: (err) => setStatus(`Error: ${err.message}`),
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      onFilesSelected(e.dataTransfer.files);
    },
    [onFilesSelected]
  );

  const onFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const updateCell = (ri: number, header: string, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[ri] = { ...copy[ri], [header]: value };
      return copy;
    });
  };

  const addManualRow = () => {
    // Ensure manualRow has all headers
    const clean: Row = {};
    headers.forEach((h) => {
      const v = manualRow[h];
      clean[h] = (v ?? '').toString();
    });
    setRows((prev) => [...prev, clean]);
    // reset inputs
    const reset: Row = {};
    headers.forEach((h) => (reset[h] = ''));
    setManualRow(reset);
  };

  const removeRow = (ri: number) => {
    setRows((prev) => prev.filter((_, i) => i !== ri));
  };

  const csvPreview = useMemo(() => {
    if (!hasData) return '';
    const csv = Papa.unparse(rows);
    return csv.slice(0, 1000); // preview first chunk
  }, [rows, hasData]);

  const generatePDF = async () => {
    try {
      if (!hasData) {
        setStatus('No data to export.');
        return;
      }
      setStatus('Generating PDF...');

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const marginX = 40;
      const marginY = 40;
      const lineGap = 18;

      doc.setFontSize(16);
      doc.text('Daily Distance Report', marginX, marginY);

      // Small meta line
      doc.setFontSize(10);
      doc.text(
        `Generated: ${new Date().toLocaleString()}`,
        marginX,
        marginY + lineGap
      );

      // Table
      const tableHeaders = headers.map((h) => ({ header: h, dataKey: h }));
      // @ts-ignore - jspdf-autotable augments jsPDF
      doc.autoTable({
        head: [headers],
        body: rows.map((r) => headers.map((h) => (r[h] ?? '').toString())),
        startY: marginY + lineGap * 2,
        styles: { fontSize: 9, cellPadding: 6, overflow: 'linebreak' },
        headStyles: { fillColor: [100, 90, 160], textColor: 255, halign: 'left' },
        bodyStyles: { halign: 'left' },
        theme: 'striped',
      });

      // QR code linking back to app
      const baseUrl =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://example.com';
      const qrPayload = `${baseUrl}`; // could append a report id if you save server-side
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 120 });

      // Place QR bottom-right
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const qrSize = 90;
      doc.addImage(
        qrDataUrl,
        'PNG',
        pageW - qrSize - marginX,
        pageH - qrSize - marginY,
        qrSize,
        qrSize
      );

      // Footer
      doc.setFontSize(9);
      doc.text(
        `QR: ${qrPayload}`,
        marginX,
        pageH - marginY / 2
      );

      doc.save(`DailyDistanceReport_${new Date().toISOString().slice(0, 10)}.pdf`);
      setStatus('PDF downloaded.');
    } catch (e: any) {
      setStatus(`PDF error: ${e.message || e}`);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-semibold mb-3">CSV → PDF (with manual rows + QR)</h1>
      <p className="text-sm text-gray-600 mb-6">
        Drop a CSV, preview/edit rows, add manual rows, then export a PDF with a QR code back to this app.
      </p>

      {/* Upload */}
      <div
        className={`border-2 border-dashed rounded-md p-6 mb-3 cursor-pointer transition ${
          dragOver ? 'bg-violet-50 border-violet-400' : 'border-gray-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={onFilePicker}
        role="button"
        aria-label="Upload CSV"
      >
        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <div className="text-center">
          <div className="text-lg font-medium">Drag & drop CSV here, or click to choose</div>
          <div className="text-xs text-gray-500 mt-1">Header row required</div>
        </div>
      </div>

      {/* Manual add (appears once headers known) */}
      {headers.length > 0 && (
        <div className="mb-4 border rounded-md p-3">
          <div className="font-medium mb-2">Add Row Manually</div>
          <div className="grid md:grid-cols-3 gap-2">
            {headers.map((h) => (
              <div key={h} className="flex flex-col">
                <label className="text-xs text-gray-600 mb-1">{h}</label>
                <input
                  className="border rounded px-2 py-1 text-sm"
                  value={(manualRow[h] ?? '').toString()}
                  onChange={(e) =>
                    setManualRow((prev) => ({ ...prev, [h]: e.target.value }))
                  }
                  placeholder={`Enter ${h}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <button
              className="px-3 py-1.5 rounded bg-violet-600 text-white text-sm hover:bg-violet-700"
              onClick={addManualRow}
            >
              Add Row
            </button>
          </div>
        </div>
      )}

      {/* Preview / editor */}
      {hasData ? (
        <div className="overflow-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-violet-200 text-gray-900">
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-white even:bg-gray-50">
                  {headers.map((h) => (
                    <td key={h} className="px-3 py-1.5 align-top">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={(r[h] ?? '').toString()}
                        onChange={(e) => updateCell(ri, h, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <button
                      className="text-red-600 text-xs hover:underline"
                      onClick={() => removeRow(ri)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-2" colSpan={headers.length + 1}>
                    No rows loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">No CSV loaded yet.</div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-gray-200 text-sm"
          onClick={() => {
            setHeaders([]);
            setRows([]);
            setManualRow({});
            setStatus('Cleared.');
          }}
        >
          Clear
        </button>
        <button
          className="px-3 py-1.5 rounded bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-50"
          onClick={generatePDF}
          disabled={!hasData}
        >
          Generate PDF
        </button>
      </div>

      {/* Status + tiny CSV preview */}
      <div className="mt-3 text-sm text-gray-700">{status}</div>
      {hasData && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-gray-600">CSV preview</summary>
          <pre className="p-2 bg-gray-50 border rounded text-xs overflow-auto">
{csvPreview}
          </pre>
        </details>
      )}
    </main>
  );
}