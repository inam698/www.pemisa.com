/**
 * Reports & Export Page
 * Download CSV reports for vouchers, stations, and audit logs.
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select-native";
import { Download, FileSpreadsheet, Building2, Shield, FileText } from "lucide-react";

export default function ReportsPage() {
  const [voucherStatus, setVoucherStatus] = useState("ALL");
  const [voucherFrom, setVoucherFrom] = useState("");
  const [voucherTo, setVoucherTo] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");

  const downloadReport = (type: string, params: Record<string, string> = {}) => {
    const token = localStorage.getItem("pimisa_token");
    const query = new URLSearchParams({ type, ...params });
    // We need to pass auth token — open in same tab with fetch
    const url = `/api/admin/export?${query}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Export failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${type}-report-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Failed to download report"));
  };

  const downloadPDF = (type: string, params: Record<string, string> = {}) => {
    const token = localStorage.getItem("pimisa_token");
    const query = new URLSearchParams({ type, ...params });
    const url = `/api/admin/export/pdf?${query}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("PDF export failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${type}-report-${new Date().toISOString().split("T")[0]}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Failed to download PDF"));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="h-6 w-6" /> Reports & Export</h1>
        <p className="text-muted-foreground">Download data reports as CSV files</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Voucher Report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Voucher Report</CardTitle>
            <CardDescription>Export all vouchers with optional filters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Status Filter</Label>
              <Select value={voucherStatus} onChange={(e) => setVoucherStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="UNUSED">Unused</option>
                <option value="USED">Redeemed</option>
                <option value="EXPIRED">Expired</option>
              </Select>
            </div>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={voucherFrom} onChange={(e) => setVoucherFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={voucherTo} onChange={(e) => setVoucherTo(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => downloadReport("vouchers", {
              ...(voucherStatus !== "ALL" && { status: voucherStatus }),
              ...(voucherFrom && { from: voucherFrom }),
              ...(voucherTo && { to: voucherTo }),
            })}>
              <Download className="h-4 w-4 mr-2" /> Download Vouchers CSV
            </Button>
            <Button variant="outline" className="w-full" onClick={() => downloadPDF("vouchers", {
              ...(voucherStatus !== "ALL" && { status: voucherStatus }),
              ...(voucherFrom && { from: voucherFrom }),
              ...(voucherTo && { to: voucherTo }),
            })}>
              <FileText className="h-4 w-4 mr-2" /> Download Vouchers PDF
            </Button>
          </CardContent>
        </Card>

        {/* Station Report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Station Report</CardTitle>
            <CardDescription>Export station performance data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Includes all stations with redemption counts, user counts, and total amounts redeemed.</p>
            <Button className="w-full" onClick={() => downloadReport("stations")}>
              <Download className="h-4 w-4 mr-2" /> Download Stations CSV
            </Button>
            <Button variant="outline" className="w-full" onClick={() => downloadPDF("stations")}>
              <FileText className="h-4 w-4 mr-2" /> Download Stations PDF
            </Button>
          </CardContent>
        </Card>

        {/* Audit Log Report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Audit Log Report</CardTitle>
            <CardDescription>Export system activity logs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => downloadReport("audit", {
              ...(auditFrom && { from: auditFrom }),
              ...(auditTo && { to: auditTo }),
            })}>
              <Download className="h-4 w-4 mr-2" /> Download Audit CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
