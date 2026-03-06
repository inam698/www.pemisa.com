/**
 * Admin Sales Page
 * View and filter oil dispensing transactions (cash + voucher).
 * Includes analytics cards and daily sales chart.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/utils/apiClient";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Banknote, Ticket, Droplets, TrendingUp, RefreshCw, Filter,
  DollarSign, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface Sale {
  id: string;
  deviceId: string;
  machineName: string;
  litres: number;
  amount: number;
  paymentType: string;
  voucherCode: string | null;
  phone: string | null;
  createdAt: string;
}

interface Analytics {
  totalSales: number;
  cashSales: number;
  voucherSales: number;
  totalLitres: number;
  totalRevenue: number;
  cashLitres: number;
  cashRevenue: number;
  voucherLitres: number;
  voucherRevenue: number;
}

interface DailySale {
  date: string;
  cashLitres: number;
  cashAmount: number;
  voucherLitres: number;
  voucherAmount: number;
  totalTransactions: number;
}

interface MachineLeaderboard {
  deviceId: string;
  name: string;
  stationName: string | null;
  totalSales: number;
  totalLitres: number;
  totalRevenue: number;
}

// ─── Helpers ────────────────────────────────────────────────────

const PIE_COLORS = ["#3b82f6", "#22c55e"];

const paymentBadge = (type: string) => {
  switch (type) {
    case "CASH":
      return <Badge variant="secondary"><Banknote className="h-3 w-3 mr-1" />Cash</Badge>;
    case "VOUCHER":
      return <Badge variant="success"><Ticket className="h-3 w-3 mr-1" />Voucher</Badge>;
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

// ─── Component ──────────────────────────────────────────────────

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [leaderboard, setLeaderboard] = useState<MachineLeaderboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { addToast } = useToast();

  // ── Fetch sales list ──────────────────────────────────────────

  const fetchSales = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: page.toString(), pageSize: "30" });
      if (paymentFilter !== "ALL") params.set("paymentType", paymentFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await apiClient<any>(`/api/admin/sales?${params}`);
      setSales(res.data);
      setTotal(res.total);
    } catch (error) {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load sales",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, paymentFilter, startDate, endDate, addToast]);

  // ── Fetch chart data ──────────────────────────────────────────

  const fetchCharts = useCallback(async () => {
    try {
      setChartsLoading(true);
      const res = await apiClient<any>("/api/admin/iot-charts");
      if (res.data) {
        setAnalytics(res.data.analytics);
        setDailySales(res.data.dailySales || []);
        setLeaderboard(res.data.machineLeaderboard || []);
      }
    } catch {
      // Charts are non-critical
    } finally {
      setChartsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    fetchCharts();
  }, [fetchCharts]);

  const totalPages = Math.ceil(total / 30);

  // ── Pie chart data ────────────────────────────────────────────
  const pieData = analytics
    ? [
        { name: "Cash", value: analytics.cashSales },
        { name: "Voucher", value: analytics.voucherSales },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
          <p className="text-muted-foreground mt-1">
            Oil dispensing transactions across all machines
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchSales(); fetchCharts(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {/* ─── Analytics Cards ─────────────────────────────────────── */}
      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics.totalSales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.totalLitres.toFixed(1)}L dispensed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">K{analytics.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Cash: K{analytics.cashRevenue.toLocaleString()} · Voucher: K{analytics.voucherRevenue.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash Sales</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics.cashSales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">{analytics.cashLitres.toFixed(1)}L dispensed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Voucher Sales</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Ticket className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics.voucherSales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">{analytics.voucherLitres.toFixed(1)}L dispensed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Charts Row ──────────────────────────────────────────── */}
      {!chartsLoading && (dailySales.length > 0 || pieData.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Daily Sales Bar Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Daily Revenue (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {dailySales.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number | undefined) => value !== undefined ? `K${value.toLocaleString()}` : ''}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="cashAmount" name="Cash" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="voucherAmount" name="Voucher" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No sales data available yet</p>
              )}
            </CardContent>
          </Card>

          {/* Payment Type Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Split</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics && analytics.totalSales > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Machine Leaderboard ─────────────────────────────────── */}
      {leaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top Machines by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.slice(0, 10).map((m, i) => (
                  <TableRow key={m.deviceId}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{m.deviceId}</p>
                      </div>
                    </TableCell>
                    <TableCell>{m.stationName || "—"}</TableCell>
                    <TableCell className="text-right">{m.totalSales}</TableCell>
                    <TableCell className="text-right">{m.totalLitres.toFixed(1)}L</TableCell>
                    <TableCell className="text-right font-medium">K{m.totalRevenue.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Filters ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Transaction Log
          </CardTitle>
          <CardDescription>All oil dispensing transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <Label className="text-xs">Payment Type</Label>
              <select
                className="block w-36 border rounded-md px-3 py-2 text-sm bg-background"
                value={paymentFilter}
                onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
              >
                <option value="ALL">All</option>
                <option value="CASH">Cash</option>
                <option value="VOUCHER">Voucher</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="w-40"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="w-40"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              />
            </div>
            {(paymentFilter !== "ALL" || startDate || endDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPaymentFilter("ALL");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* ── Table ──────────────────────────────────────────────── */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Spinner size="lg" />
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Droplets className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No sales transactions yet</p>
              <p className="text-sm mt-1">Sales will appear here once machines start dispensing oil</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {new Date(s.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{s.machineName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.deviceId}</p>
                      </div>
                    </TableCell>
                    <TableCell>{paymentBadge(s.paymentType)}</TableCell>
                    <TableCell className="text-right">{s.litres.toFixed(2)}L</TableCell>
                    <TableCell className="text-right font-medium">K{s.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{s.voucherCode || "—"}</TableCell>
                    <TableCell className="text-xs">{s.phone || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{total} transaction(s) total</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              Previous
            </Button>
            <span className="flex items-center text-sm px-2">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
