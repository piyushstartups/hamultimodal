import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { ArrowLeft, RefreshCw, Clock, CheckCircle } from 'lucide-react';

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
              <Button variant="ghost" size="icon" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Live Dashboard</h1>
              <p className="text-sm text-slate-600">{today}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-btn">
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
            {/* Overall Stats - Simplified: Only Total Hours and Total Shifts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-6" data-testid="total-hours-card">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-7 h-7 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Hours Logged</p>
                    <p className="text-3xl font-bold text-slate-900" data-testid="total-hours-value">{data.total_hours || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-6" data-testid="total-shifts-card">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Shifts Completed</p>
                    <p className="text-3xl font-bold text-slate-900" data-testid="total-shifts-value">{data.total_shifts || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per BnB - Simplified: Only Hours Logged */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Hours per BnB</h2>
              {(!data.per_bnb || data.per_bnb.length === 0) ? (
                <div className="bg-white rounded-xl border p-6 text-center text-slate-500">
                  No deployments today
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.per_bnb.map((bnb) => (
                    <div key={bnb.bnb} className="bg-white rounded-xl border overflow-hidden" data-testid={`bnb-card-${bnb.bnb}`}>
                      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                        <span className="font-semibold">{bnb.bnb}</span>
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{bnb.shift}</span>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-4xl font-bold text-green-600">{bnb.hours_logged || 0}</p>
                        <p className="text-sm text-slate-500 mt-1">hours logged</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Events - Keep for context */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent Activity</h2>
              {(!data.recent_events || data.recent_events.length === 0) ? (
                <div className="bg-white rounded-xl border p-6 text-center text-slate-500">
                  No events today yet
                </div>
              ) : (
                <div className="bg-white rounded-xl border divide-y">
                  {data.recent_events.map((event) => (
                    <div key={event.id} className="px-4 py-3 flex items-center justify-between" data-testid={`event-${event.id}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          event.event_type === 'shift_start' ? 'bg-green-100 text-green-800' :
                          event.event_type === 'shift_end' ? 'bg-red-100 text-red-800' :
                          event.event_type === 'transfer' ? 'bg-blue-100 text-blue-800' :
                          event.event_type === 'damage' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {event.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-slate-900">{event.user_name}</span>
                        {event.kit && <span className="text-sm text-slate-500">• {event.kit}</span>}
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
