import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { 
  Calendar, 
  Zap, 
  BarChart3, 
  Package, 
  FileText,
  Settings,
  LogOut,
  TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'deployment_manager';

  // Admin sees: Deployments (calendar), Live Dashboard, Analytics, Inventory, Requests, Admin Panel
  // Manager sees: Deployments (calendar), Actions, Live Dashboard, Analytics, Inventory, Requests

  const navItems = [];

  // Deployments (calendar) - for everyone
  navItems.push({ href: '/deployments', icon: Calendar, label: 'Deployments', desc: 'Plan & view deployments', color: 'bg-blue-500' });

  // Actions - only for deployment managers
  if (isManager) {
    navItems.push({ href: '/actions', icon: Zap, label: 'Quick Actions', desc: 'Transfer & damage', color: 'bg-green-500' });
  }

  // Live Dashboard - for everyone
  navItems.push({ href: '/live', icon: BarChart3, label: 'Live Dashboard', desc: "Today's hours", color: 'bg-purple-500' });

  // Analytics - for everyone
  navItems.push({ href: '/analytics', icon: TrendingUp, label: 'Analytics', desc: 'Historical data', color: 'bg-indigo-500' });

  // Inventory - for everyone
  navItems.push({ href: '/inventory', icon: Package, label: 'Inventory', desc: 'View items & status', color: 'bg-amber-500' });

  // Requests - for everyone
  navItems.push({ href: '/requests', icon: FileText, label: 'Requests', desc: 'Item requests', color: 'bg-cyan-500' });

  // Admin Panel - only for admin
  if (isAdmin) {
    navItems.push({ href: '/admin', icon: Settings, label: 'Admin Panel', desc: 'Users & Settings', color: 'bg-slate-700' });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">HA MULTIMODAL MANAGEMENT</h1>
            <p className="text-sm text-slate-600">{user?.name} • {user?.role}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} data-testid="logout-btn">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Navigation Cards */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="bg-white rounded-xl border p-5 hover:shadow-md transition-all group"
            >
              <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                <item.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-slate-900">{item.label}</h3>
              <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
