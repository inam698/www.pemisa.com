/**
 * Admin CSV Upload Page
 * Two-step process:
 * 1. Upload and validate CSV
 * 2. Review results and generate vouchers
 */

"use client";

import { useState, useRef } from "react";
import { apiClient } from "@/lib/utils/apiClient";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Rocket,
  RotateCcw,
} from "lucide-react";
import { ParsedCsvRow, RejectedRow } from "@/types";

// ─── Types ──────────────────────────────────────────────────────

interface UploadResult {
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  validRows: ParsedCsvRow[];
  rejectedRows: RejectedRow[];
  rejectedCsv: string | null;
}

interface GenerationResult {
  totalGenerated: number;
  totalSkipped: number;
  skippedPhones: string[];
  batchId: string;
  message: string;
}

type Step = "upload" | "review" | "generating" | "complete";

export default function UploadCsvPage() {
  const [step, setStep] = useState<Step>("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [generationResult, setGenerationResult] =
    useState<GenerationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  // ─── Step 1: Upload CSV ─────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!file.name.endsWith(".csv")) {
      addToast({
        title: "Invalid File",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Upload uses FormData, so we don't set Content-Type
      const token = localStorage.getItem("pimisa_token");
      const response = await fetch("/api/admin/upload-csv", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadResult(data.data);
      setStep("review");

      addToast({
        title: "CSV Processed",
        description: `${data.data.validCount} valid rows, ${data.data.rejectedCount} rejected`,
        variant: data.data.rejectedCount > 0 ? "default" : "success",
      });
    } catch (error) {
      addToast({
        title: "Upload Failed",
        description:
          error instanceof Error ? error.message : "Failed to process CSV",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // ─── Step 2: Generate Vouchers ──────────────────────────────

  const handleGenerateVouchers = async () => {
    if (!uploadResult?.validRows.length) return;

    setStep("generating");

    try {
      const response = await apiClient<{
        success: boolean;
        data: GenerationResult;
      }>("/api/admin/generate-vouchers", {
        method: "POST",
        body: JSON.stringify({ validRows: uploadResult.validRows }),
      });

      setGenerationResult(response.data);
      setStep("complete");

      addToast({
        title: "Vouchers Generated!",
        description: response.data.message,
        variant: "success",
      });
    } catch (error) {
      setStep("review"); // Go back to review on error
      addToast({
        title: "Generation Failed",
        description:
          error instanceof Error ? error.message : "Failed to generate vouchers",
        variant: "destructive",
      });
    }
  };

  // ─── Download Rejected CSV ──────────────────────────────────

  const handleDownloadRejected = () => {
    if (!uploadResult?.rejectedCsv) return;

    const blob = new Blob([uploadResult.rejectedCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejected_rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Reset to Upload ───────────────────────────────────────

  const handleReset = () => {
    setStep("upload");
    setUploadResult(null);
    setGenerationResult(null);
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload CSV</h1>
        <p className="text-muted-foreground mt-1">
          Upload beneficiary data to generate vouchers
        </p>
      </div>

      {/* ─── Step 1: Upload ─────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Upload Beneficiary CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file with columns: <strong>Name</strong>,{" "}
              <strong>Phone</strong>, <strong>Email</strong> (optional),{" "}
              <strong>VoucherAmount</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Input Zone */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {isUploading ? "Processing..." : "Select a CSV file"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Maximum file size: 5MB
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="max-w-xs mx-auto"
              />
              {isUploading && <Spinner className="mx-auto mt-4" />}
            </div>

            {/* CSV Format Guide */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">Expected CSV Format:</h4>
              <code className="text-xs bg-background px-2 py-1 rounded block">
                Name,Phone,Email,VoucherAmount
                <br />
                John Doe,0977123456,john@example.com,30
                <br />
                Jane Smith,+260966789012,,50
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: Review ─────────────────────────────────────── */}
      {step === "review" && uploadResult && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {uploadResult.totalRows}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {uploadResult.validCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Valid Entries
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {uploadResult.rejectedCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Rejected Rows
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Valid Rows Preview */}
          {uploadResult.validCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Valid Entries ({uploadResult.validCount})
                </CardTitle>
                <CardDescription>
                  These beneficiaries will receive vouchers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.validRows.slice(0, 20).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>{row.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="success">K{row.amount}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {uploadResult.validRows.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    ...and {uploadResult.validRows.length - 20} more entries
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Rejected Rows */}
          {uploadResult.rejectedCount > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      Rejected Rows ({uploadResult.rejectedCount})
                    </CardTitle>
                    <CardDescription>
                      These rows failed validation
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadRejected}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.rejectedRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.name || "—"}</TableCell>
                        <TableCell>{row.phone || "—"}</TableCell>
                        <TableCell>
                          {row.voucherAmount?.toString() || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">{row.reason}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
            {uploadResult.validCount > 0 && (
              <Button onClick={handleGenerateVouchers}>
                <Rocket className="h-4 w-4 mr-2" />
                Generate {uploadResult.validCount} Vouchers & Send SMS
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Step 3: Generating ─────────────────────────────────── */}
      {step === "generating" && (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-8 text-center">
            <Spinner size="lg" className="mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">
              Generating Vouchers...
            </h3>
            <p className="text-muted-foreground">
              Creating voucher codes and sending SMS messages.
              <br />
              This may take a moment.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 4: Complete ───────────────────────────────────── */}
      {step === "complete" && generationResult && (
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Vouchers Generated!</CardTitle>
            <CardDescription>{generationResult.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Generated:</span>
                <span className="font-bold text-green-600">
                  {generationResult.totalGenerated}
                </span>
              </div>
              {generationResult.totalSkipped > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped:</span>
                  <span className="font-bold text-amber-600">
                    {generationResult.totalSkipped}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch ID:</span>
                <span className="font-mono text-xs">
                  {generationResult.batchId}
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleReset}>
              Upload Another
            </Button>
            <Button
              onClick={() => (window.location.href = "/admin/vouchers")}
            >
              View Vouchers
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
