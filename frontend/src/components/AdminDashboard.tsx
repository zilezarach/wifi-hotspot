import { useState, useEffect } from "react";
import {
  Home,
  Users,
  Wifi,
  DollarSign,
  Settings,
  Plus,
  BarChart3,
  AlertCircle,
  CheckCircle,
  MapPin,
  TrendingUp,
  RefreshCw,
  Copy,
  Check,
  X
} from "lucide-react";
import { api } from "../lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerPhone: string;
  isActive: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  activeSessions: number;
  totalTransactions: number;
  portalUrl: string;
  createdAt: string;
}

interface DashboardStats {
  totalLocations: number;
  activeUsers: number;
  todayTransactions: number;
  todayRevenue: number;
}

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [installScript, setInstallScript] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [tenantsResult, statsResult] = await Promise.all([api.getTenants(), api.getDashboard()]);

    if (tenantsResult.success) {
      setTenants(tenantsResult.tenants || []);
    }

    if (statsResult.success) {
      setStats(statsResult.stats);
    }

    setLoading(false);
  };

  const handleCreateTenant = async (formData: any) => {
    const result = await api.createTenant(formData);

    if (result.success) {
      setInstallScript(result.installScript);
      loadData();
      alert("Tenant created successfully!");
    } else {
      alert("Failed to create tenant: " + result.error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const StatCard = ({ icon: Icon, label, value, change, color = "blue" }: any) => (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg bg-${color}-100 flex items-center justify-center`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
        {change !== undefined && (
          <span
            className={`text-sm font-medium flex items-center gap-1 ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
            <TrendingUp className="w-4 h-4" />
            {change > 0 ? "+" : ""}
            {change}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-800 mb-1">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={MapPin} label="Total Locations" value={stats?.totalLocations || 0} color="blue" />
        <StatCard icon={Users} label="Active Users" value={stats?.activeUsers || 0} change={8} color="emerald" />
        <StatCard
          icon={DollarSign}
          label="Today's Revenue"
          value={`KSh ${(stats?.todayRevenue || 0).toLocaleString()}`}
          change={12}
          color="purple"
        />
        <StatCard
          icon={BarChart3}
          label="Today's Sessions"
          value={stats?.todayTransactions || 0}
          change={5}
          color="orange"
        />
      </div>

      {/* Locations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Your Locations</h2>
              <p className="text-sm text-gray-500 mt-1">{tenants.length} locations configured</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading...</p>
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-12">
              <Wifi className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No locations yet</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add Your First Location
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {tenants.map(tenant => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${tenant.isOnline ? "bg-green-500" : "bg-red-500"}`}></div>
                    <div>
                      <div className="font-semibold text-gray-800">{tenant.name}</div>
                      <div className="text-sm text-gray-500">
                        {tenant.isOnline ? (
                          <>
                            <CheckCircle className="w-3 h-3 inline mr-1" />
                            {tenant.activeSessions} active users
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            Offline {tenant.lastSeen ? `• Last seen ${new Date(tenant.lastSeen).toLocaleString()}` : ""}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Total Sessions</div>
                      <div className="font-bold text-gray-800">{tenant.totalTransactions}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTenant(tenant);
                        // Load tenant details and installation script
                        api.getTenant(tenant.id).then(result => {
                          if (result.success && result.tenant) {
                            // Show details modal or navigate to details page
                          }
                        });
                      }}
                      className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      Manage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors text-left">
          <RefreshCw className="w-8 h-8 text-blue-600 mb-3" />
          <div className="font-semibold text-gray-800">Refresh Status</div>
          <div className="text-sm text-gray-500 mt-1">Update all locations</div>
        </button>

        <button className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-green-200 transition-colors text-left">
          <BarChart3 className="w-8 h-8 text-green-600 mb-3" />
          <div className="font-semibold text-gray-800">View Reports</div>
          <div className="text-sm text-gray-500 mt-1">Revenue & analytics</div>
        </button>

        <button className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-purple-200 transition-colors text-left">
          <Settings className="w-8 h-8 text-purple-600 mb-3" />
          <div className="font-semibold text-gray-800">Settings</div>
          <div className="text-sm text-gray-500 mt-1">Configure system</div>
        </button>
      </div>
    </div>
  );
  {
    selectedTenant && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-lg w-full">
          <h2 className="text-lg font-bold">Manage {selectedTenant.name}</h2>
          <p className="mt-2 text-sm text-gray-600">Slug: {selectedTenant.slug}</p>

          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded" onClick={() => setSelectedTenant(null)}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const AddLocationModal = () => {
    const [formData, setFormData] = useState({
      name: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
      mikrotikHost: "192.168.88.1",
      mikrotikUser: "admin",
      mikrotikPass: "",
      mikrotikPort: 8728
    });

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Add New Location</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Java Cafe Nairobi"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Owner Name *</label>
                <input
                  type="text"
                  required
                  value={formData.ownerName}
                  onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Owner Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.ownerPhone}
                  onChange={e => setFormData({ ...formData, ownerPhone: e.target.value })}
                  placeholder="254712345678"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Owner Email</label>
              <input
                type="email"
                value={formData.ownerEmail}
                onChange={e => setFormData({ ...formData, ownerEmail: e.target.value })}
                placeholder="john@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-800 mb-4">MikroTik Router Details</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Router IP *</label>
                  <input
                    type="text"
                    required
                    value={formData.mikrotikHost}
                    onChange={e => setFormData({ ...formData, mikrotikHost: e.target.value })}
                    placeholder="192.168.88.1"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Router User *</label>
                  <input
                    type="text"
                    required
                    value={formData.mikrotikUser}
                    onChange={e => setFormData({ ...formData, mikrotikUser: e.target.value })}
                    placeholder="admin"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Router Password *</label>
                <input
                  type="password"
                  required
                  value={formData.mikrotikPass}
                  onChange={e => setFormData({ ...formData, mikrotikPass: e.target.value })}
                  placeholder="Enter router password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  handleCreateTenant(formData);
                  setShowAddModal(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Create Location
              </button>
            </div>
          </div>

          {installScript && (
            <div className="p-6 border-t bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">Installation Script</h3>
                <button
                  onClick={() => copyToClipboard(installScript)}
                  className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">{installScript}</pre>
              <p className="text-sm text-gray-600 mt-2">
                Copy this script and paste it into MikroTik terminal (WinBox → New Terminal)
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Hotspot Manager</h1>
                <p className="text-sm text-gray-500">Multi-location dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                {tenants.filter(t => t.isOnline).length}/{tenants.length} Online
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-4 py-4 border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}>
              <Home className="w-5 h-5" />
              <span className="font-medium">Overview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">{activeTab === "overview" && <OverviewTab />}</div>

      {/* Modals */}
      {showAddModal && <AddLocationModal />}
    </div>
  );
}

export default AdminDashboard;
