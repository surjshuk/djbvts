"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => [currentMonthKey]);
  
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
  }, [data, selectedVehicles, selectedArea, selectedMonths]);

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

  function extractFilterOptions(records: any[]) {
    const vehicleSet = new Set<string>();
    const areaSet = new Set<string>();
    const monthSet = new Set<string>();

    records.forEach((r) => {
      if (r.vehicleNo) vehicleSet.add(r.vehicleNo);
      if (r.area) areaSet.add(r.area);
      if (r.reportDate) {
        const date = new Date(r.reportDate);
        if (!Number.isNaN(date.valueOf())) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          monthSet.add(monthKey);
        }
      }
    });

    const vehicleList = Array.from(vehicleSet).sort();
    const areaList = Array.from(areaSet).sort();
    const monthList = Array.from(monthSet).sort().reverse();

    setVehicles(vehicleList);
    setAreas(areaList);
    setMonths(monthList);

    setSelectedVehicles((prev) => prev.filter((v) => vehicleSet.has(v)));
    setSelectedMonths((prev) => {
      const valid = prev.filter((m) => monthSet.has(m));
      if (valid.length > 0) {
        return valid;
      }
      if (prev.length > 0) {
        return prev;
      }
      if (monthSet.has(currentMonthKey)) {
        return [currentMonthKey];
      }
      return [];
    });
  }

  function applyFilters() {
    let filtered = [...data];

    if (selectedVehicles.length > 0) {
      filtered = filtered.filter((r) => selectedVehicles.includes(r.vehicleNo));
    }

    if (selectedArea !== "all") {
      filtered = filtered.filter((r) => r.area === selectedArea);
    }

    if (selectedMonths.length > 0) {
      filtered = filtered.filter((r) => {
        if (!r.reportDate) return false;
        const date = new Date(r.reportDate);
        if (Number.isNaN(date.valueOf())) return false;
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        return selectedMonths.includes(monthKey);
      });
    }

    setFilteredData(filtered);
  }

  const toggleVehicleSelection = (value: string) => {
    setSelectedVehicles((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleMonthSelection = (value: string) => {
    setSelectedMonths((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  };

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
            vehicles: selectedVehicles,
            area: selectedArea,
            months: selectedMonths,
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
            <span className="block text-sm font-medium text-gray-700 mb-1">Vehicle Numbers</span>
            <div className="border border-gray-300 rounded-md bg-gray-50 divide-y divide-gray-200 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedVehicles.length === 0}
                  onChange={() => setSelectedVehicles([])}
                />
                <span>All Vehicles</span>
              </label>
              {vehicles.map((v) => (
                <label key={v} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedVehicles.includes(v)}
                    onChange={() => toggleVehicleSelection(v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
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
            <span className="block text-sm font-medium text-gray-700 mb-1">Months</span>
            <div className="border border-gray-300 rounded-md bg-gray-50 divide-y divide-gray-200 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedMonths.length === 0}
                  onChange={() => setSelectedMonths([])}
                />
                <span>All Months</span>
              </label>
              {months.map((m) => (
                <label key={m} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedMonths.includes(m)}
                    onChange={() => toggleMonthSelection(m)}
                  />
                  <span>
                    {m}
                    {m === currentMonthKey ? " (current)" : ""}
                  </span>
                </label>
              ))}
            </div>
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
