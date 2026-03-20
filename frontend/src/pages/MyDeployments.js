import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { ArrowLeft, Calendar, Users, Package } from 'lucide-react';

export default function MyDeployments() {
  const { user } = useAuth();
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [operationalDate, setOperationalDate] = useState('');
  const [displayDate, setDisplayDate] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        // Fetch operational date from backend
        const opDateRes = await api.get('/system/operational-date');
        const opDate = opDateRes.data.operational_date;
        setOperationalDate(opDate);
        
        // Format display date
        const dateObj = new Date(opDate + 'T12:00:00');
        setDisplayDate(dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
        
        // Fetch deployments for operational date
        const [depsRes, usersRes] = await Promise.all([
          api.get(`/deployments?date=${opDate}`),
          api.get('/users')
        ]);
        setDeployments(depsRes.data);
        setUsers(usersRes.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const getUserName = (userId) => {
    const u = users.find(u => u.id === userId);
    return u?.name || userId;
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <a href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </a>
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Deployments</h1>
            <p className="text-sm text-slate-600">{displayDate || 'Loading...'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : deployments.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No deployments assigned for today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deployments.map((dep) => (
              <div key={dep.id} className="bg-white rounded-xl border overflow-hidden">
                {/* BnB Header */}
                <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{dep.bnb}</span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{dep.shift}</span>
                  </div>
                </div>
                
                <div className="p-4 space-y-3">
                  {/* Kits */}
                  <div className="flex items-start gap-3">
                    <Package className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-500">Kits</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dep.assigned_kits?.map(kit => (
                          <span key={kit} className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded">
                            {kit}
                          </span>
                        ))}
                        {(!dep.assigned_kits || dep.assigned_kits.length === 0) && (
                          <span className="text-xs text-slate-400">None assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Manager */}
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-500">Manager</p>
                      <p className="text-sm font-medium text-slate-900">{getUserName(dep.deployment_manager)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
