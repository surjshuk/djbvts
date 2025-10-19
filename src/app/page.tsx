"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [areas, setAreas] = useState([]);
  const [months, setMonths] = useState([]);
  
  // Filters
  const [selectedVehicle, setSelectedVehicle] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  
  const [generating, setGenerating] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("accessToken");
    const storedEmail = localStorage.getItem("userEmail");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (storedEmail) {
      setUserEmail(storedEmail);
    }
  }, [router]);

  const formatDisplayDate = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = date.getFullYear();
    return `${dd}-${mm}-${yy}`;
  };

  // Load data from API on mount
  useEffect(() => {
    loadData();
  }, []);

  // Apply filters whenever data or filters change
  useEffect(() => {
    applyFilters();
  }, [data, selectedVehicle, selectedArea, selectedMonth]);

  async function loadData() {
    try {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          return;
        }
      }
      const res = await fetch("/api/reports/data");
      if (res.ok) {
        const records = await res.json();
        setData(records);
        extractFilterOptions(records);
      }
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }

  function extractFilterOptions(records) {
    const vehicleSet = new Set();
    const areaSet = new Set();
    const monthSet = new Set();

    records.forEach(r => {
      if (r.vehicleNo) vehicleSet.add(r.vehicleNo);
      if (r.area) areaSet.add(r.area);
      if (r.reportDate) {
        const date = new Date(r.reportDate);
        if (!Number.isNaN(date.valueOf())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthSet.add(monthKey);
        }
      }
    });

    setVehicles(Array.from(vehicleSet).sort());
    setAreas(Array.from(areaSet).sort());
    setMonths(Array.from(monthSet).sort().reverse());
  }

  function applyFilters() {
    let filtered = [...data];

    if (selectedVehicle !== "all") {
      filtered = filtered.filter(r => r.vehicleNo === selectedVehicle);
    }

    if (selectedArea !== "all") {
      filtered = filtered.filter(r => r.area === selectedArea);
    }

    if (selectedMonth !== "all") {
      filtered = filtered.filter(r => {
        if (!r.reportDate) return false;
        const date = new Date(r.reportDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return monthKey === selectedMonth;
      });
    }

    setFilteredData(filtered);
  }

  async function handleFileUpload(e) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    try {
      if (!userEmail) {
        alert("Please sign in before uploading files.");
        router.replace("/login");
        return;
      }
      setUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("uploadedBy", userEmail);

      const res = await fetch("/api/reports/data", {
        method: "POST",
        body: formData,
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || "Upload failed");
      }

      alert(`Data uploaded successfully! Snapshot code: ${payload.snapshotCode}`);
      loadData();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to process file");
    } finally {
      setUploading(false);
    }
  }

  function handleSignOut() {
    if (typeof window === "undefined") return;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("userEmail");
    router.replace("/login");
  }

  async function generatePDF() {
    if (filteredData.length === 0) {
      alert("No data to generate PDF");
      return;
    }

    try {
      setGenerating(true);

      // Determine date range
      const dates = filteredData
        .map(r => new Date(r.reportDate))
        .filter(date => !Number.isNaN(date.valueOf()))
        .sort((a, b) => a.getTime() - b.getTime());
      const dateFrom = dates[0];
      const dateTo = dates[dates.length - 1];

      if (!userEmail) {
        throw new Error("Missing logged in user email");
      }

      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: dateFrom.toISOString().split('T')[0],
          dateTo: dateTo.toISOString().split('T')[0],
          generatedByEmail: userEmail,
          filters: {
            vehicle: selectedVehicle,
            area: selectedArea,
            month: selectedMonth
          }
        })
      });

      if (!res.ok) throw new Error("PDF generation failed");

      const data = await res.json();
      
      // Download PDF
      const pdfRes = await fetch(data.pdfUrl);
      if (!pdfRes.ok) {
        throw new Error("Unable to download PDF");
      }

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${dateFrom.toISOString().split('T')[0]}_to_${dateTo.toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      alert("PDF generated successfully!");
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Daily Distance Reports</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Signed in as {userEmail || "unknown"}</span>
          <button
            onClick={handleSignOut}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-6 p-4 border rounded-lg bg-white shadow">
        <h2 className="text-lg font-semibold mb-3">Upload XLSX File</h2>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
          />
          {uploading && <span className="text-sm text-gray-600">Uploading...</span>}
        </div>
      </div>

      {/* Filters Section */}
      <div className="mb-6 p-4 border rounded-lg bg-white shadow">
        <h2 className="text-lg font-semibold mb-3">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Areas</option>
              {areas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Months</option>
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} records
          </span>
          <button
            onClick={generatePDF}
            disabled={generating || filteredData.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating..." : "Generate PDF"}
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="border rounded-lg bg-white shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">S.No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Area</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanker Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transporter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trips</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm">{row.area}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.vehicleNo}</td>
                  <td className="px-4 py-3 text-sm">{row.tankerType}</td>
                  <td className="px-4 py-3 text-sm">{row.transporterName}</td>
                  <td className="px-4 py-3 text-sm">{formatDisplayDate(row.reportDate)}</td>
                  <td className="px-4 py-3 text-sm">{row.tripDistanceKm}</td>
                  <td className="px-4 py-3 text-sm">{row.tripCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
