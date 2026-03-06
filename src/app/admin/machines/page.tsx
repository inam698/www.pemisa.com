/**
 * Admin Machines Page
 * Real-time monitoring dashboard for IoT oil dispenser machines.
 * Shows device status, oil levels, temperature, and alerts.
 * Uses SSE for live updates when machines send heartbeats.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Dialog, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Cpu, Plus, RefreshCw, Wifi, WifiOff, Wrench, Copy, Search,
  Thermometer, Droplets, AlertTriangle, Activity, Gauge,
  Fuel, DollarSign, RotateCcw, ArrowDown, ArrowUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface Machine {
  id: string;
  deviceId: string;
  name: string;
  location: string;
  stationName: string | null;
  status: string;
  lastSeen: string | null;
  pricePerLitre: number;
  firmwareVersion: string | null;
  salesCount: number;
  createdAt: string;
}

interface MonitoringMachine {
  device_id: string;
  name: string;
  location: string;
  station: string | null;
  status: string;
  last_seen: string | null;
  oil_level: number | null;
  temperature: number | null;
  pump_cycles: number | null;
  last_voucher: string | null;
  firmware_version: string | null;
}

interface MonitoringAlert {
  type: "low_oil" | "offline" | "pump_failure" | "low_tank";
  deviceId: string;
  machineName: string;
  message: string;
  severity: "warning" | "critical";
  timestamp: string;
}

interface FleetOverview {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
}

interface Station {
  id: string;
  stationName: string;
  location: string;
}

interface NewMachineResult {
  deviceId: string;
  apiKey: string;
  name: string;
}

interface InventoryMachine {
  id: string;
  deviceId: string;
  name: string;
  status: string;
  oilCapacityLitres: number;
  oilRemainingLitres: number;
  oilRemainingPercent: number;
}

interface TransactionRow {
  id: string;
  machineId: string;
  deviceId: string;
  machineName: string;
  type: string;
  voucherCode: string | null;
  oilMl: number;
  oilLitres: number;
  amountPaid: number | null;
  oilRemainingAfter: number | null;
  createdAt: string;
}

interface TransactionAnalytics {
  totalTransactions: number;
  voucherTransactions: number;
  purchaseTransactions: number;
  totalOilLitres: number;
  totalRevenue: number;
  voucherOilLitres: number;
  voucherRevenue: number;
  purchaseOilLitres: number;
  purchaseRevenue: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "ONLINE": return "bg-green-500";
    case "OFFLINE": return "bg-red-500";
    case "MAINTENANCE": return "bg-yellow-500";
    default: return "bg-gray-500";
  }
}

function getOilLevelColor(level: number | null): string {
  if (level == null) return "bg-gray-300 dark:bg-gray-600";
  if (level < 10) return "bg-red-500";
  if (level < 25) return "bg-yellow-500";
  return "bg-green-500";
}

function getOilLevelTextColor(level: number | null): string {
  if (level == null) return "text-muted-foreground";
  if (level < 10) return "text-red-600 dark:text-red-400 font-bold";
  if (level < 25) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

const statusBadge = (status: string) => {
  switch (status.toUpperCase()) {
    case "ONLINE":
      return <Badge variant="success"><Wifi className="h-3 w-3 mr-1" />Online</Badge>;
    case "OFFLINE":
      return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>;
    case "MAINTENANCE":
      return <Badge variant="warning"><Wrench className="h-3 w-3 mr-1" />Maintenance</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const alertIcon = (type: string) => {
  switch (type) {
    case "low_oil": return <Droplets className="h-4 w-4 text-yellow-500" />;
    case "low_tank": return <Fuel className="h-4 w-4 text-orange-500" />;
    case "offline": return <WifiOff className="h-4 w-4 text-red-500" />;
    case "pump_failure": return <AlertTriangle className="h-4 w-4 text-red-600" />;
    default: return <AlertTriangle className="h-4 w-4" />;
  }
};

// ─── Oil Level Bar Component ────────────────────────────────────

function OilLevelBar({ level }: { level: number | null }) {
  if (level == null) {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getOilLevelColor(level)}`}
          style={{ width: `${Math.min(level, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-10 text-right ${getOilLevelTextColor(level)}`}>
        {level.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [monitoringMachines, setMonitoringMachines] = useState<MonitoringMachine[]>([]);
  const [overview, setOverview] = useState<FleetOverview>({ total: 0, online: 0, offline: 0, maintenance: 0 });
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newMachine, setNewMachine] = useState<NewMachineResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [tab, setTab] = useState<"monitoring" | "inventory" | "transactions" | "manage">("monitoring");
  const [inventory, setInventory] = useState<InventoryMachine[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txAnalytics, setTxAnalytics] = useState<TransactionAnalytics | null>(null);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txFilter, setTxFilter] = useState<string>("all");
  const [refillMachine, setRefillMachine] = useState<InventoryMachine | null>(null);
  const [refillAmount, setRefillAmount] = useState("");
  const [refilling, setRefilling] = useState(false);
  const { addToast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Form state
  const [formName, setFormName] = useState("Oil Dispenser");
  const [formLocation, setFormLocation] = useState("");
  const [formStationId, setFormStationId] = useState("");
  const [formPrice, setFormPrice] = useState("45");

  // ─── Fetch monitoring data ──────────────────────────────────────

  const fetchMonitoring = useCallback(async () => {
    try {
      const res = await apiClient<any>("/api/admin/machines/monitoring");
      if (res.data) {
        setMonitoringMachines(res.data.machines || []);
        setOverview(res.data.overview || { total: 0, online: 0, offline: 0, maintenance: 0 });
        setAlerts(res.data.alerts || []);
      }
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
    }
  }, []);

  const fetchMachines = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: page.toString(), pageSize: "20" });
      if (search) params.set("search", search);

      const res = await apiClient<any>(`/api/admin/machines?${params}`);
      setMachines(res.data);
      setTotal(res.total);
    } catch (error) {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load machines",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, addToast]);

  const fetchStations = useCallback(async () => {
    try {
      const res = await apiClient<any>("/api/admin/stations?pageSize=200");
      setStations(res.data || []);
    } catch {
      // Stations are optional
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await apiClient<any>("/api/admin/machines/inventory");
      setInventory(res.data || []);
    } catch {
      // Inventory is optional
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: txPage.toString(), pageSize: "20" });
      if (txFilter !== "all") params.set("type", txFilter);
      const res = await apiClient<any>(`/api/admin/transactions?${params}`);
      setTransactions(res.data || []);
      setTxTotal(res.total || 0);
      if (res.analytics) setTxAnalytics(res.analytics);
    } catch {
      // Transactions optional
    }
  }, [txPage, txFilter]);

  // ─── SSE Connection with auto-reconnect for 24/7 monitoring ──

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("pimisa_token") : null;
    if (!token) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      eventSource = new EventSource(
        `/api/admin/machines/stream?token=${encodeURIComponent(token!)}`
      );
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setSseConnected(true);
        reconnectAttempts = 0; // Reset backoff on successful connect
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "heartbeat") {
            setMonitoringMachines(prev => {
              const idx = prev.findIndex(m => m.device_id === data.deviceId);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  status: data.status?.toLowerCase() || updated[idx].status,
                  oil_level: data.oilLevel ?? updated[idx].oil_level,
                  temperature: data.temperature ?? updated[idx].temperature,
                  pump_cycles: data.pumpCycles ?? updated[idx].pump_cycles,
                  last_voucher: data.lastVoucher ?? updated[idx].last_voucher,
                  last_seen: data.lastSeen || updated[idx].last_seen,
                };
                return updated;
              }
              return prev;
            });
          }

          if (data.type === "alert") {
            setAlerts(prev => [{
              type: data.alertType || "offline",
              deviceId: data.deviceId,
              machineName: data.deviceId,
              message: data.message,
              severity: (data.alertType === "low_oil" ? "warning" : "critical") as "warning" | "critical",
              timestamp: data.timestamp,
            }, ...prev].slice(0, 50));

            if (data.alertType === "offline" || data.alertType === "pump_failure") {
              addToast({
                title: `Alert: ${data.deviceId}`,
                description: data.message,
                variant: "destructive",
              });
            }
          }
        } catch {
          // Invalid JSON, ignore
        }
      };

      eventSource.onerror = () => {
        setSseConnected(false);
        eventSource?.close();
        eventSourceRef.current = null;

        if (unmounted) return;

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
      eventSourceRef.current = null;
    };
  }, [addToast]);

  // ─── Initial load & polling fallback ────────────────────────────

  useEffect(() => {
    fetchMonitoring();
    fetchMachines();
    fetchStations();
    fetchInventory();
    fetchTransactions();
  }, [fetchMonitoring, fetchMachines, fetchStations, fetchInventory, fetchTransactions]);

  // Poll monitoring data every 30s as fallback (SSE is primary)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMonitoring();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  // ─── Tank refill ─────────────────────────────────────────────────

  const handleRefill = async () => {
    if (!refillMachine || !refillAmount) return;
    setRefilling(true);
    try {
      const res = await apiClient<any>("/api/admin/machines/inventory", {
        method: "POST",
        body: JSON.stringify({
          machineId: refillMachine.id,
          litres: parseFloat(refillAmount),
        }),
      });
      addToast({ title: "Tank Refilled", description: res.message || "Success" });
      setRefillMachine(null);
      setRefillAmount("");
      fetchInventory();
      fetchMonitoring();
    } catch (error) {
      addToast({
        title: "Refill Failed",
        description: error instanceof Error ? error.message : "Failed to refill",
        variant: "destructive",
      });
    } finally {
      setRefilling(false);
    }
  };

  // ─── Machine registration ──────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiClient<any>("/api/admin/machines", {
        method: "POST",
        body: JSON.stringify({
          name: formName,
          location: formLocation,
          stationId: formStationId || undefined,
          pricePerLitre: parseFloat(formPrice) || 45,
        }),
      });

      setNewMachine({
        deviceId: res.data.deviceId,
        apiKey: res.data.apiKey,
        name: res.data.name,
      });

      addToast({
        title: "Machine Registered",
        description: `Device ID: ${res.data.deviceId}`,
      });

      fetchMachines();
      fetchMonitoring();
    } catch (error) {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create machine",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const totalPages = Math.ceil(total / 20);

  // Filter monitoring machines by search
  const filteredMonitoringMachines = monitoringMachines.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.device_id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.location && m.location.toLowerCase().includes(q)) ||
      (m.station && m.station.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Machine Monitoring</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            Real-time dispenser monitoring and management
            {sseConnected ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Polling
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchMonitoring(); fetchMachines(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />Register Machine
          </Button>
        </div>
      </div>

      {/* Fleet Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Machines</p>
                <p className="text-3xl font-bold">{overview.total}</p>
              </div>
              <Cpu className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{overview.online}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Offline</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{overview.offline}</p>
              </div>
              <WifiOff className="h-8 w-8 text-red-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{alerts.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {alerts.slice(0, 10).map((alert, idx) => (
                <div
                  key={`${alert.deviceId}-${alert.type}-${idx}`}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    alert.severity === "critical"
                      ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
                      : "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
                  }`}
                >
                  {alertIcon(alert.type)}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{alert.machineName}</span>
                    <span className="mx-2 text-muted-foreground">—</span>
                    <span>{alert.message}</span>
                  </div>
                  <Badge variant={alert.severity === "critical" ? "destructive" : "warning"} className="shrink-0">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("monitoring")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "monitoring"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="h-4 w-4 inline mr-2" />Monitoring
        </button>
        <button
          onClick={() => setTab("inventory")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "inventory"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Fuel className="h-4 w-4 inline mr-2" />Inventory
        </button>
        <button
          onClick={() => setTab("transactions")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "transactions"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <DollarSign className="h-4 w-4 inline mr-2" />Transactions
        </button>
        <button
          onClick={() => setTab("manage")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "manage"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Cpu className="h-4 w-4 inline mr-2" />Manage
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by device ID, name, or location..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* ─── MONITORING TAB ──────────────────────────────────────── */}
      {tab === "monitoring" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dispenser Fleet Status</CardTitle>
            <CardDescription>
              Real-time oil levels, temperature, and connectivity
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredMonitoringMachines.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Cpu className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No machines to display</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Status</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        <Droplets className="h-3.5 w-3.5" />Oil Level
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        <Thermometer className="h-3.5 w-3.5" />Temp
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5" />Pump Cycles
                      </span>
                    </TableHead>
                    <TableHead>Last Voucher</TableHead>
                    <TableHead>Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMonitoringMachines.map((m) => (
                    <TableRow
                      key={m.device_id}
                      className={
                        m.status === "offline"
                          ? "opacity-60"
                          : m.oil_level != null && m.oil_level < 10
                          ? "bg-yellow-50/50 dark:bg-yellow-950/20"
                          : ""
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${getStatusColor(m.status)} ${
                            m.status === "online" ? "animate-pulse" : ""
                          }`} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{m.device_id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{m.location || "—"}</p>
                          {m.station && (
                            <p className="text-xs text-muted-foreground">{m.station}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <OilLevelBar level={m.oil_level} />
                      </TableCell>
                      <TableCell>
                        {m.temperature != null ? (
                          <span className={`text-sm font-mono ${
                            m.temperature > 80 ? "text-red-600 dark:text-red-400 font-bold" :
                            m.temperature > 60 ? "text-amber-600 dark:text-amber-400" :
                            "text-foreground"
                          }`}>
                            {m.temperature.toFixed(1)}°C
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {m.pump_cycles != null ? m.pump_cycles.toLocaleString() : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono text-muted-foreground">
                          {m.last_voucher || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(m.last_seen)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── INVENTORY TAB ─────────────────────────────────────── */}
      {tab === "inventory" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Fuel className="h-5 w-5" />Tank Inventory
              </CardTitle>
              <CardDescription>
                Oil capacity and remaining levels for all machines
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Fuel className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No machines with inventory data</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Machine</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Tank Level</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((m) => (
                      <TableRow
                        key={m.id}
                        className={m.oilRemainingPercent < 10 ? "bg-red-50/50 dark:bg-red-950/20" : ""}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{m.deviceId}</p>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(m.status)}</TableCell>
                        <TableCell className="font-mono">{m.oilCapacityLitres.toLocaleString()}L</TableCell>
                        <TableCell>
                          <span className={`font-mono ${
                            m.oilRemainingPercent < 10 ? "text-red-600 dark:text-red-400 font-bold" :
                            m.oilRemainingPercent < 25 ? "text-yellow-600 dark:text-yellow-400" :
                            "text-green-600 dark:text-green-400"
                          }`}>
                            {m.oilRemainingLitres.toFixed(1)}L
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  m.oilRemainingPercent < 10 ? "bg-red-500" :
                                  m.oilRemainingPercent < 25 ? "bg-yellow-500" :
                                  "bg-green-500"
                                }`}
                                style={{ width: `${Math.min(m.oilRemainingPercent, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono w-10 text-right">
                              {m.oilRemainingPercent.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRefillMachine(m); setRefillAmount(""); }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />Refill
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TRANSACTIONS TAB ──────────────────────────────────── */}
      {tab === "transactions" && (
        <div className="space-y-6">
          {/* Analytics cards */}
          {txAnalytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                  <p className="text-3xl font-bold">{txAnalytics.totalTransactions}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Voucher Usage</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{txAnalytics.voucherTransactions}</p>
                  <p className="text-xs text-muted-foreground">{txAnalytics.voucherOilLitres.toFixed(1)}L dispensed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Customer Purchases</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{txAnalytics.purchaseTransactions}</p>
                  <p className="text-xs text-muted-foreground">{txAnalytics.purchaseOilLitres.toFixed(1)}L dispensed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">K{txAnalytics.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{txAnalytics.totalOilLitres.toFixed(1)}L total dispensed</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filter */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {["all", "voucher", "purchase"].map((f) => (
              <button
                key={f}
                onClick={() => { setTxFilter(f); setTxPage(1); }}
                className={`px-3 py-1 rounded text-sm ${
                  txFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Transaction table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction History</CardTitle>
              <CardDescription>
                All voucher redemptions and direct purchases
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead>Oil (ml)</TableHead>
                      <TableHead>Oil (L)</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead>Tank After</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Badge variant={tx.type === "voucher" ? "secondary" : "success"}>
                            {tx.type === "voucher" ? (
                              <><ArrowDown className="h-3 w-3 mr-1" />Voucher</>
                            ) : (
                              <><ArrowUp className="h-3 w-3 mr-1" />Purchase</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{tx.machineName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{tx.deviceId}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{tx.oilMl.toFixed(0)}</TableCell>
                        <TableCell className="font-mono">{tx.oilLitres.toFixed(2)}</TableCell>
                        <TableCell className="font-mono">
                          {tx.amountPaid != null ? `K${tx.amountPaid.toFixed(0)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {tx.voucherCode || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tx.oilRemainingAfter != null ? `${tx.oilRemainingAfter.toFixed(1)}L` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {Math.ceil(txTotal / 20) > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{txTotal} transaction(s)</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage <= 1}>
                  Previous
                </Button>
                <span className="flex items-center text-sm px-2">Page {txPage} of {Math.ceil(txTotal / 20)}</span>
                <Button size="sm" variant="outline" onClick={() => setTxPage(p => Math.min(Math.ceil(txTotal / 20), p + 1))} disabled={txPage >= Math.ceil(txTotal / 20)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MANAGE TAB ──────────────────────────────────────────── */}
      {tab === "manage" && (
        <>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Spinner size="lg" />
                </div>
              ) : machines.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Cpu className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No machines registered yet</p>
                  <p className="text-sm mt-1">Click &quot;Register Machine&quot; to add your first dispenser</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Station</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Price/L</TableHead>
                      <TableHead>Sales</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machines.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.deviceId}</TableCell>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>{m.location || "—"}</TableCell>
                        <TableCell>{m.stationName || "—"}</TableCell>
                        <TableCell>{statusBadge(m.status)}</TableCell>
                        <TableCell>K{m.pricePerLitre}</TableCell>
                        <TableCell>{m.salesCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.lastSeen ? new Date(m.lastSeen).toLocaleString() : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{total} machine(s) total</p>
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
        </>
      )}

      {/* Register Machine Dialog */}
      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setNewMachine(null); }}>
        <DialogHeader>
          <DialogTitle>{newMachine ? "Machine Credentials" : "Register New Machine"}</DialogTitle>
        </DialogHeader>

        {newMachine ? (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                ⚠️ Save these credentials now. The API key will not be shown again.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Machine Name</Label>
                <p className="font-medium">{newMachine.name}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Device ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">{newMachine.deviceId}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newMachine.deviceId, "Device ID")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{newMachine.apiKey}</code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newMachine.apiKey, "API Key")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground">
                Flash these into your ESP32 firmware config.h:
              </p>
              <pre className="text-xs mt-1 font-mono whitespace-pre-wrap">
{`#define DEVICE_ID "${newMachine.deviceId}"
#define API_KEY   "${newMachine.apiKey}"`}
              </pre>
            </div>
            <Button className="w-full" onClick={() => { setShowCreate(false); setNewMachine(null); }}>I&apos;ve Saved the Credentials</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Machine Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Oil Dispenser #1" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Lusaka Market" />
            </div>
            <div>
              <Label>Station (optional)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={formStationId}
                onChange={(e) => setFormStationId(e.target.value)}
              >
                <option value="">— No station —</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.stationName} — {s.location}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Price per Litre (ZMW)</Label>
              <Input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="45" />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={creating || !formName}>
              {creating ? <Spinner size="sm" /> : "Register Machine"}
            </Button>
          </div>
        )}
      </Dialog>

      {/* Refill Tank Dialog */}
      <Dialog open={!!refillMachine} onClose={() => { setRefillMachine(null); setRefillAmount(""); }}>
        <DialogHeader>
          <DialogTitle>Refill Tank — {refillMachine?.name}</DialogTitle>
        </DialogHeader>

        {refillMachine && (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Device</span>
                <span className="font-mono">{refillMachine.deviceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-mono">{refillMachine.oilCapacityLitres.toLocaleString()}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currently Remaining</span>
                <span className="font-mono">{refillMachine.oilRemainingLitres.toFixed(1)}L ({refillMachine.oilRemainingPercent.toFixed(0)}%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Space Available</span>
                <span className="font-mono font-bold">{(refillMachine.oilCapacityLitres - refillMachine.oilRemainingLitres).toFixed(1)}L</span>
              </div>
            </div>

            <div>
              <Label>Litres to Add</Label>
              <Input
                type="number"
                value={refillAmount}
                onChange={(e) => setRefillAmount(e.target.value)}
                placeholder={`Max ${(refillMachine.oilCapacityLitres - refillMachine.oilRemainingLitres).toFixed(0)}`}
                max={refillMachine.oilCapacityLitres - refillMachine.oilRemainingLitres}
                min={1}
              />
            </div>

            <Button className="w-full" onClick={handleRefill} disabled={refilling || !refillAmount || parseFloat(refillAmount) <= 0}>
              {refilling ? <Spinner size="sm" /> : "Confirm Refill"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
