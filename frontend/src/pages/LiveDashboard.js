import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ArrowLeft, RefreshCw, Clock, CheckCircle, Timer, Play, ChevronLeft, ChevronRight } from 'lucide-react';

export default function LiveDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const params = isAdmin ? `?date=${selectedDate}` : '';
      const response = await api.get(`/dashboard/live${params}`);
      setData(response.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const changeDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
    setLoading(true);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
  });

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
              <p className="text-sm text-slate-600">{isToday ? 'Today' : displayDate}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Date Selector - Admin only for historical view */}
        {isAdmin && (
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => changeDate(-1)} data-testid="prev-date">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setLoading(true); }}
                  className="w-44"
                  data-testid="date-picker"
                />
                {!isToday && (
                  <Button variant="outline" size="sm" onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setLoading(true); }}>
                    Today
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => changeDate(1)} disabled={isToday} data-testid="next-date">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Auto-note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          <Timer className="w-4 h-4 inline mr-2" />
          All durations are <strong>automatically calculated</strong> from shift logs
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : data ? (
          <>
            {/* Overall Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-5" data-testid="total-hours-card">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Hours</p>
                    <p className="text-2xl font-bold text-slate-900" data-testid="total-hours-value">
                      {formatDuration(data.total_hours)}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-5" data-testid="completed-shifts-card">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Completed</p>
                    <p className="text-2xl font-bold text-slate-900" data-testid="completed-value">
                      {data.total_shifts_completed || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-5" data-testid="active-shifts-card">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Play className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Active Now</p>
                    <p className="text-2xl font-bold text-slate-900" data-testid="active-value">
                      {data.total_shifts_active || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per BnB */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Hours per BnB</h2>
              {(!data.per_bnb || data.per_bnb.length === 0) ? (
                <div className="bg-white rounded-xl border p-6 text-center text-slate-500">
                  No data for this date
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.per_bnb.map((bnb) => (
                    <div key={bnb.bnb} className="bg-white rounded-xl border overflow-hidden" data-testid={`bnb-card-${bnb.bnb}`}>
                      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                        <span className="font-semibold">{bnb.bnb}</span>
                        <div className="flex items-center gap-2">
                          {bnb.active_shifts > 0 && (
                            <span className="text-xs bg-green-500 px-2 py-0.5 rounded-full animate-pulse">
                              {bnb.active_shifts} active
                            </span>
                          )}
                          <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{bnb.shift}</span>
                        </div>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-3xl font-bold text-green-600">{formatDuration(bnb.hours_logged)}</p>
                        <p className="text-sm text-slate-500 mt-1">logged</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Completed Shifts */}
            {data.recent_shifts && data.recent_shifts.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent Completed Shifts</h2>
                <div className="bg-white rounded-xl border divide-y">
                  {data.recent_shifts.map((shift) => (
                    <div key={shift.id} className="px-4 py-3 flex items-center justify-between" data-testid={`shift-${shift.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{shift.user_name}</p>
                          <p className="text-xs text-slate-500">{shift.kit} • {shift.activity_type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{formatDuration(shift.total_duration_hours)}</p>
                        {shift.end_time && (
                          <p className="text-xs text-slate-400">
                            {new Date(shift.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last Update */}
            {lastUpdate && (
              <p className="text-xs text-slate-400 text-center">
                Auto-refreshes every 30 seconds • Last: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
