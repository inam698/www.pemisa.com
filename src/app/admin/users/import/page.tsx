/**
 * Bulk User Import Page
 * Upload CSV file to import multiple users at once
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, Download, CheckCircle2, XCircle, Users } from "lucide-react";

interface ImportResult {
  success: boolean;
  imported?: any[];
  errors?: any[];
  summary?: {
    total: number;
    imported: number;
    failed: number;
  };
}

export default function UserImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = () => {
    const csvContent = "name,email,role,stationId,password\nJohn Doe,john@example.com,STATION,station-id-here,optional-password\nJane Smith,jane@example.com,ADMIN,,";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split("\n").filter((line) => line.trim());
    const headers = lines[0].split(",").map((h) => h.trim());
    const users = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const user: any = {};
      headers.forEach((header, index) => {
        if (values[index]) {
          user[header] = values[index];
        }
      });
      users.push(user);
    }

    return users;
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const users = parseCSV(text);

      const token = localStorage.getItem("pimisa_token");
      const response = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ users }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        errors: [{ error: "Failed to import users. Please check your file format." }],
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Bulk User Import
        </h1>
        <p className="text-muted-foreground">Upload a CSV file to import multiple users at once</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Import Form */}
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
            <CardDescription>Select a CSV file with user data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>CSV File</Label>
              <Input type="file" accept=".csv" onChange={handleFileChange} />
              {file && <p className="text-sm text-muted-foreground mt-2">Selected: {file.name}</p>}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={!file || importing} className="flex-1">
                <Upload className="h-4 w-4 mr-2" />
                {importing ? "Importing..." : "Import Users"}
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Template
              </Button>
            </div>

            {/* CSV Format Instructions */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <p className="font-semibold text-sm">CSV Format Requirements:</p>
              <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                <li>Header row: name,email,role,stationId,password</li>
                <li>Role must be ADMIN or STATION</li>
                <li>STATION users must have stationId</li>
                <li>Password is optional (auto-generated if omitted)</li>
                <li>Email must be unique</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Import Results */}
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
            <CardDescription>Status of the last import operation</CardDescription>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-muted-foreground text-center py-8">No import results yet</p>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                {result.summary && (
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Total:</span>
                      <span className="font-semibold">{result.summary.total}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span className="text-sm">Imported:</span>
                      <span className="font-semibold">{result.summary.imported}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span className="text-sm">Failed:</span>
                      <span className="font-semibold">{result.summary.failed}</span>
                    </div>
                  </div>
                )}

                {/* Imported Users */}
                {result.imported && result.imported.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Successfully Imported
                    </h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {result.imported.map((user: any, i: number) => (
                        <div key={i} className="bg-green-50 dark:bg-green-950/20 p-3 rounded text-sm">
                          <p className="font-medium">{user.name}</p>
                          <p className="text-muted-foreground">{user.email} - {user.role}</p>
                          {user.defaultPassword && (
                            <p className="text-xs text-red-600 mt-1">
                              Default Password: {user.defaultPassword}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" /> Errors
                    </h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {result.errors.map((error: any, i: number) => (
                        <div key={i} className="bg-red-50 dark:bg-red-950/20 p-3 rounded text-sm text-red-600">
                          {typeof error === "string" ? error : error.error || error.email}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
