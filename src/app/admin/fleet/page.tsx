/**
 * Admin Fleet Management Page
 * Manage locations and view fleet overview with machine assignments.
 * Features: location CRUD, machine-to-location assignment, fleet stats, pricing rules.
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
  Dialog, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin, Plus, RefreshCw, Search, Building2, Cpu,
  Wifi, WifiOff, Wrench, AlertTriangle,
  DollarSign, Trash2, Edit, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface LocationMachine {
  id: string;
  deviceId: string;
  name: string;
  status: string;
  oilRemainingLitres: number;
  oilCapacityLitres?: number;
  pricePerLitre?: number;
  lastSeen?: string;
  firmwareVersion?: string | null;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  machineCount: number;
  machines: LocationMachine[];
  createdAt: string;
  updatedAt: string;
}

interface FleetOverview {
  totalLocations: number;
  totalMachines: number;
  onlineMachines: number;
  offlineMachines: number;
  lowOilMachines: number;
  locations: Location[];
}

interface PricingRule {
  id: string;
  machineId: string;
  pricePerLitre: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  machine?: { deviceId: string; name: string };
}

interface UnassignedMachine {
  id: string;
  deviceId: string;
  name: string;
  status: string;
}

// ─── Component ──────────────────────────────────────────────────

export default function FleetPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [allMachines, setAllMachines] = useState<UnassignedMachine[]>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState<"locations" | "pricing">("locations");

  // Dialog state
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [showCreatePricing, setShowCreatePricing] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState<string | null>(null);

  // Form state
  const [locationForm, setLocationForm] = useState({
    name: "", address: "", city: "", region: "",
    latitude: "", longitude: "",
  });
  const [pricingForm, setPricingForm] = useState({
    machineId: "", pricePerLitre: "", startTime: "", endTime: "",
  });

  const [search, setSearch] = useState("");

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchFleetData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, pricingRes, machinesRes] = await Promise.all([
        apiClient<{ success: boolean; data: FleetOverview }>(
          "/api/admin/locations?overview=true"
        ),
        apiClient<{ success: boolean; data: PricingRule[] }>(
          "/api/admin/pricing"
        ),
        apiClient<{ success: boolean; data: UnassignedMachine[] }>(
          "/api/admin/machines?pageSize=200"
        ),
      ]);

      if (overviewRes.success) setOverview(overviewRes.data);
      if (pricingRes.success) setPricingRules(pricingRes.data);
      if (machinesRes.success) setAllMachines(machinesRes.data);
    } catch (err) {
      addToast({ title: "Error", description: "Failed to load fleet data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchFleetData(); }, [fetchFleetData]);

  // ─── Location CRUD ──────────────────────────────────────────

  const handleCreateLocation = async () => {
    try {
      const payload: Record<string, unknown> = {
        name: locationForm.name,
        address: locationForm.address,
        city: locationForm.city,
        region: locationForm.region,
      };
      if (locationForm.latitude) payload.latitude = parseFloat(locationForm.latitude);
      if (locationForm.longitude) payload.longitude = parseFloat(locationForm.longitude);

      await apiClient("/api/admin/locations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      addToast({ title: "Success", description: "Location created" });
      setShowCreateLocation(false);
      resetLocationForm();
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create", variant: "destructive" });
    }
  };

  const handleUpdateLocation = async () => {
    if (!editingLocation) return;
    try {
      const payload: Record<string, unknown> = {
        name: locationForm.name,
        address: locationForm.address,
        city: locationForm.city,
        region: locationForm.region,
      };
      if (locationForm.latitude) payload.latitude = parseFloat(locationForm.latitude);
      if (locationForm.longitude) payload.longitude = parseFloat(locationForm.longitude);

      await apiClient(`/api/admin/locations/${editingLocation.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      addToast({ title: "Success", description: "Location updated" });
      setEditingLocation(null);
      resetLocationForm();
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Delete this location? Machines will be unassigned.")) return;
    try {
      await apiClient(`/api/admin/locations/${id}`, { method: "DELETE" });
      addToast({ title: "Success", description: "Location deleted" });
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleAssignMachine = async (locationId: string, machineId: string, assign: boolean) => {
    try {
      await apiClient(`/api/admin/locations/${locationId}/assign`, {
        method: "POST",
        body: JSON.stringify({ machineId, assign }),
      });
      addToast({ title: "Success", description: assign ? "Machine assigned" : "Machine unassigned" });
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: "Failed to assign machine", variant: "destructive" });
    }
  };

  // ─── Pricing CRUD ──────────────────────────────────────────

  const handleCreatePricing = async () => {
    try {
      await apiClient("/api/admin/pricing", {
        method: "POST",
        body: JSON.stringify({
          machineId: pricingForm.machineId,
          pricePerLitre: parseFloat(pricingForm.pricePerLitre),
          startTime: new Date(pricingForm.startTime).toISOString(),
          endTime: new Date(pricingForm.endTime).toISOString(),
          isActive: true,
        }),
      });
      addToast({ title: "Success", description: "Pricing rule created" });
      setShowCreatePricing(false);
      setPricingForm({ machineId: "", pricePerLitre: "", startTime: "", endTime: "" });
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create", variant: "destructive" });
    }
  };

  const handleTogglePricing = async (rule: PricingRule) => {
    try {
      await apiClient(`/api/admin/pricing/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const handleDeletePricing = async (id: string) => {
    try {
      await apiClient(`/api/admin/pricing/${id}`, { method: "DELETE" });
      addToast({ title: "Deleted", description: "Pricing rule removed" });
      fetchFleetData();
    } catch (err) {
      addToast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  // ─── Helpers ────────────────────────────────────────────────

  const resetLocationForm = () => {
    setLocationForm({ name: "", address: "", city: "", region: "", latitude: "", longitude: "" });
  };

  const startEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocationForm({
      name: loc.name,
      address: loc.address,
      city: loc.city,
      region: loc.region,
      latitude: loc.latitude?.toString() || "",
      longitude: loc.longitude?.toString() || "",
    });
  };

  const statusIcon = (status: string) => {
    if (status === "ONLINE") return <Wifi className="h-4 w-4 text-green-500" />;
    if (status === "MAINTENANCE") return <Wrench className="h-4 w-4 text-yellow-500" />;
    return <WifiOff className="h-4 w-4 text-muted-foreground" />;
  };

  const filteredLocations = overview?.locations.filter(
    (loc) =>
      !search ||
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.city.toLowerCase().includes(search.toLowerCase()) ||
      loc.region.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // ─── Loading State ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fleet Management</h1>
          <p className="text-muted-foreground">
            Manage locations, machine assignments, and pricing rules
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFleetData}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MapPin className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{overview?.totalLocations ?? 0}</p>
                <p className="text-xs text-muted-foreground">Locations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Cpu className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{overview?.totalMachines ?? 0}</p>
                <p className="text-xs text-muted-foreground">Machines</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wifi className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{overview?.onlineMachines ?? 0}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <WifiOff className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{overview?.offlineMachines ?? 0}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{overview?.lowOilMachines ?? 0}</p>
                <p className="text-xs text-muted-foreground">Low Oil</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "locations" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("locations")}
        >
          <Building2 className="h-4 w-4 mr-2" /> Locations
        </Button>
        <Button
          variant={activeTab === "pricing" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("pricing")}
        >
          <DollarSign className="h-4 w-4 mr-2" /> Pricing Rules
        </Button>
      </div>

      {/* ─── Locations Tab ───────────────────────────────────── */}
      {activeTab === "locations" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search locations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { resetLocationForm(); setShowCreateLocation(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Location
            </Button>
          </div>

          {filteredLocations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No locations yet. Create one to start grouping machines.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredLocations.map((loc) => (
                <Card key={loc.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-3 cursor-pointer flex-1"
                        onClick={() => setExpandedLocation(expandedLocation === loc.id ? null : loc.id)}
                      >
                        <MapPin className="h-5 w-5 text-blue-500" />
                        <div>
                          <CardTitle className="text-base">{loc.name}</CardTitle>
                          <CardDescription>
                            {[loc.address, loc.city, loc.region].filter(Boolean).join(", ") || "No address"}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="ml-2">
                          {loc.machineCount} machine{loc.machineCount !== 1 ? "s" : ""}
                        </Badge>
                        {expandedLocation === loc.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => startEditLocation(loc)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowAssignDialog(loc.id)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteLocation(loc.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {expandedLocation === loc.id && loc.machines && loc.machines.length > 0 && (
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Device</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Oil Level</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loc.machines.map((m) => {
                            const oilPct = m.oilCapacityLitres
                              ? Math.round((m.oilRemainingLitres / m.oilCapacityLitres) * 100)
                              : 0;
                            return (
                              <TableRow key={m.id}>
                                <TableCell className="font-mono text-xs">{m.deviceId}</TableCell>
                                <TableCell>{m.name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {statusIcon(m.status)}
                                    <span className="text-sm">{m.status}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          oilPct > 30 ? "bg-green-500" : oilPct > 15 ? "bg-yellow-500" : "bg-red-500"
                                        }`}
                                        style={{ width: `${Math.min(oilPct, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{oilPct}%</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleAssignMachine(loc.id, m.id, false)}
                                  >
                                    Unassign
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Pricing Rules Tab ───────────────────────────────── */}
      {activeTab === "pricing" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreatePricing(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Pricing Rule
            </Button>
          </div>

          {pricingRules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pricing rules yet. Machines use their default price.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Price/Litre</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricingRules.map((rule) => {
                    const now = new Date();
                    const isCurrentlyActive =
                      rule.isActive &&
                      new Date(rule.startTime) <= now &&
                      new Date(rule.endTime) >= now;
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono text-xs">
                          {rule.machine?.deviceId ?? rule.machineId.slice(0, 8)}
                          {rule.machine?.name && (
                            <span className="block text-muted-foreground font-sans">
                              {rule.machine.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          KSh {rule.pricePerLitre.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(rule.startTime).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(rule.endTime).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {isCurrentlyActive ? (
                            <Badge className="bg-green-500/10 text-green-500">Active Now</Badge>
                          ) : rule.isActive ? (
                            <Badge variant="secondary">Scheduled</Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTogglePricing(rule)}
                          >
                            {rule.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePricing(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* ─── Create Location Dialog ──────────────────────────── */}
      {(showCreateLocation || editingLocation) && (
        <Dialog
          open={true}
          onClose={() => { setShowCreateLocation(false); setEditingLocation(null); resetLocationForm(); }}
        >
              <DialogHeader>
                <DialogTitle>
                  {editingLocation ? "Edit Location" : "Create Location"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={locationForm.name}
                    onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                    placeholder="Nairobi Depot"
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={locationForm.address}
                    onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                    placeholder="123 Industrial Area"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>City</Label>
                    <Input
                      value={locationForm.city}
                      onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })}
                      placeholder="Nairobi"
                    />
                  </div>
                  <div>
                    <Label>Region</Label>
                    <Input
                      value={locationForm.region}
                      onChange={(e) => setLocationForm({ ...locationForm, region: e.target.value })}
                      placeholder="Nairobi County"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={locationForm.latitude}
                      onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                      placeholder="-1.2921"
                    />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={locationForm.longitude}
                      onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                      placeholder="36.8219"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowCreateLocation(false); setEditingLocation(null); resetLocationForm(); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingLocation ? handleUpdateLocation : handleCreateLocation}
                  disabled={!locationForm.name}
                >
                  {editingLocation ? "Update" : "Create"}
                </Button>
              </div>
        </Dialog>
      )}

      {/* ─── Assign Machine Dialog ───────────────────────────── */}
      {showAssignDialog && (
        <Dialog open={true} onClose={() => setShowAssignDialog(null)}>
              <DialogHeader>
                <DialogTitle>Assign Machine to Location</DialogTitle>
              </DialogHeader>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {allMachines
                  .filter((m) => {
                    // Show machines not already in this location
                    const loc = overview?.locations.find((l) => l.id === showAssignDialog);
                    return !loc?.machines?.some((lm) => lm.id === m.id);
                  })
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-mono text-sm">{m.deviceId}</p>
                        <p className="text-xs text-muted-foreground">{m.name}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleAssignMachine(showAssignDialog, m.id, true);
                          setShowAssignDialog(null);
                        }}
                      >
                        Assign
                      </Button>
                    </div>
                  ))}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowAssignDialog(null)}>
                  Close
                </Button>
              </div>
        </Dialog>
      )}

      {/* ─── Create Pricing Rule Dialog ──────────────────────── */}
      {showCreatePricing && (
        <Dialog open={true} onClose={() => setShowCreatePricing(false)}>
              <DialogHeader>
                <DialogTitle>Create Pricing Rule</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Machine *</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={pricingForm.machineId}
                    onChange={(e) => setPricingForm({ ...pricingForm, machineId: e.target.value })}
                  >
                    <option value="">Select a machine</option>
                    {allMachines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.deviceId} — {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Price per Litre (KSh) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pricingForm.pricePerLitre}
                    onChange={(e) => setPricingForm({ ...pricingForm, pricePerLitre: e.target.value })}
                    placeholder="50.00"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date *</Label>
                    <Input
                      type="datetime-local"
                      value={pricingForm.startTime}
                      onChange={(e) => setPricingForm({ ...pricingForm, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End Date *</Label>
                    <Input
                      type="datetime-local"
                      value={pricingForm.endTime}
                      onChange={(e) => setPricingForm({ ...pricingForm, endTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreatePricing(false)}>Cancel</Button>
                <Button
                  onClick={handleCreatePricing}
                  disabled={!pricingForm.machineId || !pricingForm.pricePerLitre || !pricingForm.startTime || !pricingForm.endTime}
                >
                  Create Rule
                </Button>
              </div>
        </Dialog>
      )}
    </div>
  );
}
