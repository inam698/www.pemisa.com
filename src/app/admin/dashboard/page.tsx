/**
 * Admin Dashboard Page
 * Displays key metrics, redemption charts, and recent activity.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/utils/apiClient";
import { DashboardMetrics } from "@/types";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Ticket,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface ChartData {
  dailyRedemptions: { date: string; count: number; amount: number }[];
  statusDistribution: { status: string; count: number; amount: number }[];
  stationData: { stationName: string; redemptions: number; amount: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  UNUSED: "#f59e0b",
  USED: "#22c55e",
  EXPIRED: "#ef4444",
};

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [metricsRes, chartRes] = await Promise.all([
        apiClient<{ success: boolean; data: DashboardMetrics }>("/api/admin/dashboard"),
        apiClient<{ success: boolean; data: ChartData }>("/api/admin/charts").catch(() => null),
      ]);
      setMetrics(metricsRes.data);
      if (chartRes?.data) setChartData(chartRes.data);
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to load dashboard",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const metricCards = [
    {
      title: "Total Vouchers",
      value: metrics?.totalVouchers || 0,
      icon: Ticket,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
      description: `K${(metrics?.totalAmount || 0).toLocaleString()} total value`,
    },
    {
      title: "Redeemed",
      value: metrics?.redeemedVouchers || 0,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-950",
      description: `K${(metrics?.redeemedAmount || 0).toLocaleString()} redeemed`,
    },
    {
      title: "Unused",
      value: metrics?.unusedVouchers || 0,
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-950",
      description: "Pending redemption",
    },
    {
      title: "Expired",
      value: metrics?.expiredVouchers || 0,
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-100 dark:bg-red-950",
      description: "Past 7-day window",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Voucher distribution overview and metrics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ─── Metric Cards ───────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div
                className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center`}
              >
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {card.value.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Redemption Rate ────────────────────────────────────── */}
      {metrics && metrics.totalVouchers > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Redemption Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        (metrics.redeemedVouchers / metrics.totalVouchers) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-2xl font-bold">
                {(
                  (metrics.redeemedVouchers / metrics.totalVouchers) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Charts Section ─────────────────────────────────────── */}
      {chartData && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Redemptions Line Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Daily Redemptions (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.dailyRedemptions.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData.dailyRedemptions}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: any) => String(v).slice(5)}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                      labelFormatter={(v: any) => new Date(String(v)).toLocaleDateString()}
                      formatter={(value: any) => {
                        const v = value as number;
                        return [`${v} vouchers`, "Redemptions"];
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="count" name="Redemptions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="amount" name="Amount (K)" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-8 text-muted-foreground">No redemption data available</p>
              )}
            </CardContent>
          </Card>

          {/* Status Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Voucher Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.statusDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={chartData.statusDistribution}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry: any) => {
                        const data = entry as any;
                        return `${data.status || entry.name || ""} ${((data.count || entry.value || 0) / chartData.statusDistribution.reduce((sum, d) => sum + d.count, 0) * 100).toFixed(0)}%`;
                      }}
                    >
                      {chartData.statusDistribution.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [`${value} vouchers`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-8 text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Station Performance Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Station Leaderboard</CardTitle>
              <CardDescription>Redemptions by station</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.stationData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData.stationData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="stationName" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="redemptions" name="Redemptions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-8 text-muted-foreground">No station data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Recent Redemptions ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Redemptions</CardTitle>
          <CardDescription>
            Latest voucher redemptions across all stations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics?.recentRedemptions &&
          metrics.recentRedemptions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Redeemed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.recentRedemptions.map((redemption) => (
                  <TableRow key={redemption.id}>
                    <TableCell className="font-medium">
                      {redemption.name}
                    </TableCell>
                    <TableCell>{redemption.phone}</TableCell>
                    <TableCell>
                      <Badge variant="success">
                        K{redemption.amount.toFixed(0)}
                      </Badge>
                    </TableCell>
                    <TableCell>{redemption.stationName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(redemption.redeemedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No redemptions yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
