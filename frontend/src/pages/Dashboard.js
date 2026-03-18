import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { 
  Calendar, 
  Zap, 
  BarChart3, 
  Package, 
  FileText,
  Settings,
  LogOut
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { href: '/my-deployments', icon: Calendar, label: 'My Deployments', desc: 'View assigned work', color: 'bg-blue-500' },
    { href: '/actions', icon: Zap, label: 'Actions', desc: 'Log shifts & events', color: 'bg-green-500' },
    { href: '/live', icon: BarChart3, label: 'Live Dashboard', desc: "Today's performance", color: 'bg-purple-500' },
    { href: '/inventory', icon: Package, label: 'Inventory', desc: 'View items & status', color: 'bg-amber-500' },
    { href: '/requests', icon: FileText, label: 'Requests', desc: 'Item requests', color: 'bg-cyan-500' },
  ];

  if (isAdmin) {
    navItems.push({ href: '/admin', icon: Settings, label: 'Admin Panel', desc: 'Manage system', color: 'bg-slate-700' });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">OPS MANAGEMENT</h1>
            <p className="text-sm text-slate-600">{user?.name} • {user?.role}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout}>
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
