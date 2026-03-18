import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { ArrowLeft, RefreshCw, Activity, Database, Zap } from 'lucide-react';

export default function LiveDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get('/dashboard/live');
      setData(response.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Live Dashboard</h1>
              <p className="text-sm text-slate-600">{today}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : data ? (
          <>
            {/* Overall Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Active Shifts</p>
                    <p className="text-2xl font-bold text-slate-900">{data.total.active_shifts}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Events</p>
                    <p className="text-2xl font-bold text-slate-900">{data.total.total_events}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Database className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Data Collected</p>
                    <p className="text-2xl font-bold text-slate-900">{data.total.data_collected} GB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per BnB */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">By Location</h2>
              {data.per_bnb.length === 0 ? (
                <div className="bg-white rounded-xl border p-6 text-center text-slate-500">
                  No deployments today
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.per_bnb.map((bnb) => (
                    <div key={bnb.bnb} className="bg-white rounded-xl border overflow-hidden">
                      <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
                        <span className="font-semibold">{bnb.bnb}</span>
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{bnb.shift}</span>
                      </div>
                      <div className="p-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-green-600">{bnb.active_shifts}</p>
                          <p className="text-xs text-slate-500">Active</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-blue-600">{bnb.shift_ends}</p>
                          <p className="text-xs text-slate-500">Completed</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-purple-600">{bnb.data_collected}</p>
                          <p className="text-xs text-slate-500">GB</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Events */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent Activity</h2>
              {data.recent_events.length === 0 ? (
                <div className="bg-white rounded-xl border p-6 text-center text-slate-500">
                  No events today yet
                </div>
              ) : (
                <div className="bg-white rounded-xl border divide-y">
                  {data.recent_events.map((event) => (
                    <div key={event.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          event.event_type === 'shift_start' ? 'bg-green-100 text-green-800' :
                          event.event_type === 'shift_end' ? 'bg-red-100 text-red-800' :
                          event.event_type === 'transfer' ? 'bg-blue-100 text-blue-800' :
                          event.event_type === 'damage' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {event.event_type}
                        </span>
                        <span className="text-sm text-slate-900">{event.user_name}</span>
                        <span className="text-sm text-slate-500">• {event.kit}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Last Update */}
            {lastUpdate && (
              <p className="text-xs text-slate-400 text-center">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
