"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ReportRow = {
  id: string;
  area: string;
  vehicleNo: string;
  tankerType: string;
  transporterName: string;
  reportDate: string;
  tripDistanceKm: string;
  tripCount: number;
};

type ReportRowForm = Omit<ReportRow, "tripCount" | "id"> & { tripCount: string };

const EMPTY_FORM: ReportRowForm = {
  area: "",
  vehicleNo: "",
  tankerType: "",
  transporterName: "",
  reportDate: "",
  tripDistanceKm: "",
  tripCount: "",
};

const formFromRow = (row: ReportRow): ReportRowForm => ({
  area: row.area ?? "",
  vehicleNo: row.vehicleNo ?? "",
  tankerType: row.tankerType ?? "",
  transporterName: row.transporterName ?? "",
  reportDate: (() => {
    const date = new Date(row.reportDate);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString().split("T")[0];
    }
    return row.reportDate ?? "";
  })(),
  tripDistanceKm: row.tripDistanceKm ?? "",
  tripCount: row.tripCount != null ? String(row.tripCount) : "",
});

export default function ReportsPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<ReportRow[]>([]);
  const [filteredData, setFilteredData] = useState<ReportRow[]>([]);
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ReportRowForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

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
      setLoading(true);
      setPageError(null);
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          setLoading(false);
          return;
        }
      }
      const res = await fetch("/api/reports/data");
      if (res.ok) {
        const records = (await res.json()) as ReportRow[];
        setData(records);
        extractFilterOptions(records);
      } else {
        setPageError("Failed to load report data");
      }
    } catch (e) {
      console.error("Failed to load data:", e);
      setPageError("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }

  function extractFilterOptions(records: ReportRow[]) {
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

  const startNewRow = () => {
    setEditingRowId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const startEditRow = (row: ReportRow) => {
    setEditingRowId(row.id);
    setFormState(formFromRow(row));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleDeleteRow = async (row: ReportRow) => {
    if (!userEmail) {
      alert("Please sign in before modifying data.");
      router.replace("/login");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Are you sure you want to delete this row?");
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/reports/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, deletedBy: userEmail }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to delete row");
      }

      if (editingRowId === row.id) {
        handleFormCancel();
      }

      await loadData();
    } catch (error) {
      console.error(error);
      setFormError(error instanceof Error ? error.message : "Failed to delete row");
    } finally {
      setSaving(false);
    }
  };

  const handleFormCancel = () => {
    setIsFormOpen(false);
    setEditingRowId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
  };

  const handleFormChange = (field: keyof ReportRowForm, value: string) => {
    if (field === "tripCount") {
      if (value === "" || /^[0-9]+$/.test(value)) {
        setFormState((prev) => ({ ...prev, [field]: value }));
      }
      return;
    }
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!formState.area.trim()) {
      setFormError("Area is required.");
      return;
    }
    if (!formState.vehicleNo.trim()) {
      setFormError("Vehicle number is required.");
      return;
    }
    if (!formState.reportDate) {
      setFormError("Report date is required.");
      return;
    }

    if (!userEmail) {
      alert("Please sign in before modifying data.");
      router.replace("/login");
      return;
    }

    const payload = {
      area: formState.area.trim(),
      vehicleNo: formState.vehicleNo.trim(),
      tankerType: formState.tankerType.trim(),
      transporterName: formState.transporterName.trim(),
      reportDate: formState.reportDate,
      tripDistanceKm: formState.tripDistanceKm.trim(),
      tripCount: formState.tripCount ? Number(formState.tripCount) : 0,
    };

    setSaving(true);

    try {
      const headers = { "Content-Type": "application/json" };
      let res: Response;

      if (editingRowId) {
        res = await fetch("/api/reports/data", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ id: editingRowId, record: payload, updatedBy: userEmail }),
        });
      } else {
        res = await fetch("/api/reports/data", {
          method: "POST",
          headers,
          body: JSON.stringify({ record: payload, uploadedBy: userEmail }),
        });
      }

      if (!res.ok) {
        const response = await res.json().catch(() => ({}));
        throw new Error(response?.error || "Failed to save row");
      }

      await loadData();
      handleFormCancel();
    } catch (error) {
      console.error(error);
      setFormError(error instanceof Error ? error.message : "Failed to save row");
    } finally {
      setSaving(false);
    }
  };

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
      if (!dateFrom || !dateTo) {
        throw new Error("Filtered rows do not contain valid dates.");
      }
      const rangeStart = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1);
      const rangeEnd = new Date(dateTo.getFullYear(), dateTo.getMonth() + 1, 0);

      if (!userEmail) {
        throw new Error("Missing logged in user email");
      }

      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: rangeStart.toISOString().split("T")[0],
          dateTo: rangeEnd.toISOString().split("T")[0],
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
      const now = new Date();
      const stamp = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}T${String(now.getHours()).padStart(2, "0")}_${String(now.getMinutes()).padStart(2, "0")}_${String(now.getSeconds()).padStart(2, "0")}`;
      a.download = `DailyDistanceReport(${stamp}).pdf`;
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
      {pageError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {pageError}
        </div>
      )}
      {loading && (
        <div className="mb-4 text-sm text-gray-600">Loading report data…</div>
      )}
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
            disabled={generating || filteredData.length === 0 || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating..." : "Generate PDF"}
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="border rounded-lg bg-white shadow overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <span className="text-sm text-gray-700">{filteredData.length} rows selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startNewRow}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              New Row
            </button>
          </div>
        </div>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((row, idx) => (
                <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm">{row.area}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.vehicleNo}</td>
                  <td className="px-4 py-3 text-sm">{row.tankerType}</td>
                  <td className="px-4 py-3 text-sm">{row.transporterName}</td>
                  <td className="px-4 py-3 text-sm">{formatDisplayDate(row.reportDate)}</td>
                  <td className="px-4 py-3 text-sm">{row.tripDistanceKm}</td>
                  <td className="px-4 py-3 text-sm">{row.tripCount}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditRow(row)}
                        disabled={saving}
                        className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row)}
                        disabled={saving}
                        className="px-2 py-1 text-xs font-medium text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isFormOpen && (
          <div className="border-t border-gray-200 bg-white">
            <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">
                  {editingRowId ? "Edit Row" : "Add New Row"}
                </h3>
                <button
                  type="button"
                  onClick={handleFormCancel}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Area
                  <input
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.area}
                    onChange={(e) => handleFormChange("area", e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Vehicle No.
                  <input
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.vehicleNo}
                    onChange={(e) => handleFormChange("vehicleNo", e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Tanker Type
                  <input
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.tankerType}
                    onChange={(e) => handleFormChange("tankerType", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Transporter
                  <input
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.transporterName}
                    onChange={(e) => handleFormChange("transporterName", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Report Date
                  <input
                    type="date"
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.reportDate}
                    onChange={(e) => handleFormChange("reportDate", e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Distance (km)
                  <input
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.tripDistanceKm}
                    onChange={(e) => handleFormChange("tripDistanceKm", e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Trip Count
                  <input
                    type="number"
                    min="0"
                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formState.tripCount}
                    onChange={(e) => handleFormChange("tripCount", e.target.value)}
                  />
                </label>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleFormCancel}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingRowId ? "Save Changes" : "Add Row"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
