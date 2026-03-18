import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  PlayCircle,
  StopCircle,
  Activity,
  ArrowRightLeft,
  AlertTriangle,
  Package,
  Bell,
  LogOut,
} from 'lucide-react';
import EventDialog from '../components/EventDialog';
import StatsCard from '../components/StatsCard';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
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
    fetchStats();
    fetchUnreadCount();
  };

  const actionButtons = [
    {
      label: 'Start Shift',
      icon: PlayCircle,
      type: 'start_shift',
      color: 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200',
    },
    {
      label: 'End Shift',
      icon: StopCircle,
      type: 'end_shift',
      color: 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200',
    },
    {
      label: 'Add Activity',
      icon: Activity,
      type: 'activity',
      color: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
    },
    {
      label: 'Transfer Item',
      icon: ArrowRightLeft,
      type: 'transfer',
      color: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200',
    },
    {
      label: 'Report Damage',
      icon: AlertTriangle,
      type: 'damage',
      color: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200',
    },
    {
      label: 'Create Request',
      icon: Package,
      type: 'request',
      color: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="noise-overlay" />
      
      {/* Header */}
      <div className="backdrop-blur-md bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-tactical text-slate-900">OpsInventory</h1>
              <p className="text-sm text-slate-600 mt-0.5">Welcome back, {user?.name}</p>
            </div>
            
            <div className="flex items-center gap-3">
              <a href="/notifications">
                <Button data-testid="notifications-button" variant="ghost" size="icon" className="relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </a>
              <Button data-testid="logout-button" onClick={logout} variant="ghost" size="icon">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatsCard label="Active Kits" value={stats.kits} color="green" />
          <StatsCard label="Total Items" value={stats.items} color="blue" />
          <StatsCard label="Active Shifts" value={stats.activeShifts} color="amber" />
          <StatsCard label="Pending Requests" value={stats.pendingRequests} color="red" />
        </div>

        {/* Action Panel */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold font-tactical text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {actionButtons.map((btn) => (
              <Button
                key={btn.type}
                data-testid={`action-${btn.type}-button`}
                onClick={() => openEventDialog(btn.type)}
                className={`h-24 flex flex-col items-center justify-center gap-2 border ${btn.color} font-medium hover:shadow-md transition-all duration-200`}
                variant="outline"
              >
                <btn.icon className="w-6 h-6" strokeWidth={1.5} />
                <span className="text-xs font-tactical">{btn.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(user?.role === 'deployer' || user?.assigned_bnb) && (
            <a href="/my-bnb" className="block">
              <div data-testid="nav-my-bnb" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
                <h3 className="font-semibold font-tactical text-slate-900 mb-2">My BnB</h3>
                <p className="text-sm text-slate-600">View your assigned BnB & kits</p>
              </div>
            </a>
          )}
          
          {(user?.role === 'admin' || user?.role === 'supervisor') && (
            <a href="/admin" className="block">
              <div data-testid="nav-admin" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
                <h3 className="font-semibold font-tactical text-slate-900 mb-2">Admin Panel</h3>
                <p className="text-sm text-slate-600">Manage assignments & teams</p>
              </div>
            </a>
          )}
          
          <a href="/inventory" className="block">
            <div data-testid="nav-inventory" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
              <h3 className="font-semibold font-tactical text-slate-900 mb-2">Inventory View</h3>
              <p className="text-sm text-slate-600">View all items and their locations</p>
            </div>
          </a>
          
          <a href="/events" className="block">
            <div data-testid="nav-events" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
              <h3 className="font-semibold font-tactical text-slate-900 mb-2">Events Log</h3>
              <p className="text-sm text-slate-600">Review all logged actions</p>
            </div>
          </a>
          
          <a href="/requests" className="block">
            <div data-testid="nav-requests" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
              <h3 className="font-semibold font-tactical text-slate-900 mb-2">Requests</h3>
              <p className="text-sm text-slate-600">Manage item requests</p>
            </div>
          </a>
          
          <a href="/damage" className="block">
            <div data-testid="nav-damage" className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200 cursor-pointer">
              <h3 className="font-semibold font-tactical text-slate-900 mb-2">Damage Tracking</h3>
              <p className="text-sm text-slate-600">Monitor equipment issues</p>
            </div>
          </a>
        </div>
      </div>

      {/* Event Dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eventType={eventType}
        onSuccess={handleEventCreated}
      />
    </div>
  );
}
