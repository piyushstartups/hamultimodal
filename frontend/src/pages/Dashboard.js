import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  PlayCircle,
  StopCircle,
  ArrowRightLeft,
  AlertTriangle,
  Package,
  Bell,
  LogOut,
  MapPin,
  Users,
  BarChart3,
  Calendar,
  Settings,
  Clock,
  Clipboard,
  History,
  AlertCircle,
} from 'lucide-react';
import EventDialog from '../components/EventDialog';
import StatsCard from '../components/StatsCard';
import BulkTransferDialog from '../components/BulkTransferDialog';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [eventType, setEventType] = useState('');
  const [stats, setStats] = useState({ kits: 0, items: 0, activeShifts: 0, pendingRequests: 0 });
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchStats();
    fetchUnreadCount();
  }, []);

  const fetchStats = async () => {
    try {
      const [kitsRes, itemsRes, eventsRes, requestsRes] = await Promise.all([
        api.get('/kits'),
        api.get('/items'),
        api.get('/events?event_type=start_shift'),
        api.get('/requests?status_filter=pending'),
      ]);
      
      const activeKits = kitsRes.data.filter(k => k.status === 'active').length;
      const activeShifts = eventsRes.data.filter(e => {
        const today = new Date().toISOString().split('T')[0];
        return e.timestamp.startsWith(today);
      }).length;
      
      setStats({
        kits: activeKits,
        items: itemsRes.data.length,
        activeShifts,
        pendingRequests: requestsRes.data.length,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread/count');
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const openEventDialog = (type) => {
    setEventType(type);
    setDialogOpen(true);
  };

  const handleEventCreated = () => {
    setDialogOpen(false);
    setBulkTransferOpen(false);
    fetchStats();
    fetchUnreadCount();
  };

  // Role-based configurations
  const isFieldWorker = ['deployer', 'station'].includes(user?.role);
  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const isInventoryManager = user?.role === 'inventory_manager';

  // Simplified action buttons for field workers
  const fieldWorkerActions = [
    { label: 'Start Shift', icon: PlayCircle, type: 'start_shift', color: 'bg-green-600 hover:bg-green-700 text-white' },
    { label: 'End Shift', icon: StopCircle, type: 'end_shift', color: 'bg-red-600 hover:bg-red-700 text-white' },
    { label: 'Report Issue', icon: AlertTriangle, type: 'damage', color: 'bg-amber-600 hover:bg-amber-700 text-white' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-wide">HUMAN ARCHIVE</h1>
              <p className="text-sm text-slate-600">{user?.name} • {user?.role}</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/notifications" className="relative">
                <Button variant="ghost" size="icon">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </a>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Field Worker View - Simplified */}
        {isFieldWorker && (
          <>
            {/* Quick Actions - Large buttons for field workers */}
            <div className="grid grid-cols-3 gap-4">
              {fieldWorkerActions.map(action => (
                <Button
                  key={action.type}
                  data-testid={`action-${action.type}-button`}
                  onClick={() => openEventDialog(action.type)}
                  className={`${action.color} h-24 flex flex-col items-center justify-center gap-2 rounded-xl`}
                >
                  <action.icon className="w-8 h-8" />
                  <span className="font-semibold">{action.label}</span>
                </Button>
              ))}
            </div>

            {/* My BnB Card - Primary for field workers */}
            <a href="/my-bnb" className="block">
              <div className="bg-white rounded-xl border-2 border-indigo-200 p-6 hover:shadow-lg transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <MapPin className="w-7 h-7 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">My BnB Dashboard</h2>
                    <p className="text-slate-600">View your assigned kits and today's status</p>
                  </div>
                </div>
              </div>
            </a>

            {/* Secondary actions */}
            <div className="grid grid-cols-2 gap-3">
              <a href="/handover" className="block">
                <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <Clipboard className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-900">Shift Handover</span>
                  </div>
                </div>
              </a>
              <a href="/requests" className="block">
                <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-900">My Requests</span>
                  </div>
                </div>
              </a>
            </div>
          </>
        )}

        {/* Admin/Supervisor View */}
        {(isAdmin || isSupervisor) && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard title="Active Kits" value={stats.kits} icon={Package} color="blue" />
              <StatsCard title="Today's Shifts" value={stats.activeShifts} icon={Clock} color="green" />
              <StatsCard title="Pending Requests" value={stats.pendingRequests} icon={AlertCircle} color="amber" />
              <StatsCard title="Total Items" value={stats.items} icon={Package} color="purple" />
            </div>

            {/* Primary Actions - Admin */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a href="/deployment-planning" className="block">
                <div className="bg-indigo-600 text-white rounded-xl p-6 hover:bg-indigo-700 transition-all">
                  <Calendar className="w-8 h-8 mb-3" />
                  <h3 className="text-lg font-bold">Deployment Planning</h3>
                  <p className="text-indigo-200 text-sm">Plan daily BnB assignments</p>
                </div>
              </a>
              <a href="/analytics" className="block">
                <div className="bg-cyan-600 text-white rounded-xl p-6 hover:bg-cyan-700 transition-all">
                  <BarChart3 className="w-8 h-8 mb-3" />
                  <h3 className="text-lg font-bold">Analytics Dashboard</h3>
                  <p className="text-cyan-200 text-sm">Performance trends & charts</p>
                </div>
              </a>
              <a href="/incidents" className="block">
                <div className="bg-red-600 text-white rounded-xl p-6 hover:bg-red-700 transition-all">
                  <AlertTriangle className="w-8 h-8 mb-3" />
                  <h3 className="text-lg font-bold">Incidents & Penalties</h3>
                  <p className="text-red-200 text-sm">Track damage & accountability</p>
                </div>
              </a>
            </div>

            {/* Secondary Navigation */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Access</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {isAdmin && (
                  <a href="/admin" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                    <Settings className="w-5 h-5" />
                    <span>Admin Panel</span>
                  </a>
                )}
                <a href="/inventory-summary" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <Package className="w-5 h-5" />
                  <span>Inventory</span>
                </a>
                <a href="/events" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <History className="w-5 h-5" />
                  <span>Events Log</span>
                </a>
                <a href="/requests" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <Clipboard className="w-5 h-5" />
                  <span>Requests</span>
                </a>
                <a href="/reports/lost-items" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <AlertCircle className="w-5 h-5" />
                  <span>Lost Items</span>
                </a>
                <a href="/reports/ssd-offload" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <Package className="w-5 h-5" />
                  <span>SSD Offload</span>
                </a>
                <a href="/damage" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Damage Tracking</span>
                </a>
                {(isAdmin || isInventoryManager) && (
                  <a href="/inventory-management" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                    <Settings className="w-5 h-5" />
                    <span>Manage Inventory</span>
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Inventory Manager View */}
        {isInventoryManager && !isAdmin && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard title="Total Items" value={stats.items} icon={Package} color="blue" />
              <StatsCard title="Active Kits" value={stats.kits} icon={Package} color="green" />
              <StatsCard title="Pending Requests" value={stats.pendingRequests} icon={AlertCircle} color="amber" />
              <StatsCard title="Today's Shifts" value={stats.activeShifts} icon={Clock} color="purple" />
            </div>

            {/* Primary Actions - Inventory Manager */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a href="/inventory-management" className="block">
                <div className="bg-green-600 text-white rounded-xl p-6 hover:bg-green-700 transition-all">
                  <Package className="w-8 h-8 mb-3" />
                  <h3 className="text-lg font-bold">Inventory Management</h3>
                  <p className="text-green-200 text-sm">Add, edit, manage items</p>
                </div>
              </a>
              <a href="/inventory-summary" className="block">
                <div className="bg-blue-600 text-white rounded-xl p-6 hover:bg-blue-700 transition-all">
                  <BarChart3 className="w-8 h-8 mb-3" />
                  <h3 className="text-lg font-bold">Inventory Summary</h3>
                  <p className="text-blue-200 text-sm">Bird's eye view</p>
                </div>
              </a>
            </div>

            {/* Secondary Navigation */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Access</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <a href="/inventory" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <Package className="w-5 h-5" />
                  <span>Item Details</span>
                </a>
                <a href="/events" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <History className="w-5 h-5" />
                  <span>Events Log</span>
                </a>
                <a href="/reports/lost-items" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <AlertCircle className="w-5 h-5" />
                  <span>Lost Items</span>
                </a>
                <a href="/damage" className="flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 text-slate-700">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Damage Tracking</span>
                </a>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Event Dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eventType={eventType}
        onSuccess={handleEventCreated}
      />
      
      {/* Bulk Transfer Dialog */}
      <BulkTransferDialog
        open={bulkTransferOpen}
        onClose={() => setBulkTransferOpen(false)}
        onSuccess={handleEventCreated}
      />
    </div>
  );
}
