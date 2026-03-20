import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  ArrowLeft, RefreshCw, Clock, ChevronLeft, ChevronRight, 
  ChevronDown, ChevronUp, MapPin, Package, AlertTriangle, 
  XCircle, Sun, Moon
} from 'lucide-react';

export default function LiveDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedBnbs, setExpandedBnbs] = useState({});

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const response = await api.get(`/dashboard/live?date=${selectedDate}`);
      setData(response.data);
      setLastUpdate(new Date());
      
      // Auto-expand all BnBs on first load
      if (response.data.bnbs) {
        const expanded = {};
        response.data.bnbs.forEach(bnb => { expanded[bnb.bnb] = true; });
        setExpandedBnbs(expanded);
      }
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

  const toggleBnb = (bnb) => {
    setExpandedBnbs(prev => ({ ...prev, [bnb]: !prev[bnb] }));
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold">Live Dashboard</h1>
              <p className="text-sm text-white/70">{displayDate}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="border-white/30 text-white hover:bg-white/20" data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Date Selector */}
        <div className="bg-white rounded-xl border p-3 flex items-center justify-between">
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

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : data ? (
          <>
            {/* TOP LEVEL SUMMARY */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-green-500 text-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">Total Hours Collected</p>
                    <p className="text-4xl font-bold" data-testid="total-hours-value">{formatDuration(data.total_hours)}</p>
                  </div>
                  {data.active_count > 0 && (
                    <div className="bg-white/20 px-4 py-2 rounded-lg text-center">
                      <p className="text-2xl font-bold">{data.active_count}</p>
                      <p className="text-xs text-green-100">Active Now</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Category-wise breakdown */}
              {data.category_hours && Object.keys(data.category_hours).length > 0 && (
                <div className="px-6 py-4 border-t">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-3">Hours by Category</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(data.category_hours).sort((a, b) => b[1] - a[1]).map(([category, hours]) => (
                      <div key={category} className="bg-slate-100 px-4 py-2 rounded-lg" data-testid={`category-${category}`}>
                        <p className="text-lg font-bold text-slate-800">{formatDuration(hours)}</p>
                        <p className="text-xs text-slate-500">{category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* BNB LEVEL VIEW */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">BnB Breakdown</h2>
              {(!data.bnbs || data.bnbs.length === 0) ? (
                <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                  No deployments for this date
                </div>
              ) : (
                <div className="space-y-4">
                  {data.bnbs.map((bnb) => (
                    <div key={bnb.bnb} className="bg-white rounded-xl border overflow-hidden" data-testid={`bnb-card-${bnb.bnb}`}>
                      {/* BnB Header */}
                      <button
                        onClick={() => toggleBnb(bnb.bnb)}
                        className="w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5" />
                          <span className="font-bold text-lg">{bnb.bnb}</span>
                          {bnb.active_count > 0 && (
                            <span className="text-xs bg-green-500 px-2 py-0.5 rounded-full animate-pulse">
                              {bnb.active_count} active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xl font-bold text-green-400">{formatDuration(bnb.total_hours)}</span>
                          {expandedBnbs[bnb.bnb] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </button>
                      
                      {expandedBnbs[bnb.bnb] && (
                        <div className="p-4 space-y-4">
                          {/* Shift Split */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                              <Sun className="w-6 h-6 text-amber-500" />
                              <div>
                                <p className="text-lg font-bold text-amber-700">{formatDuration(bnb.morning_hours)}</p>
                                <p className="text-xs text-amber-600">Morning Shift</p>
                              </div>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-3">
                              <Moon className="w-6 h-6 text-indigo-500" />
                              <div>
                                <p className="text-lg font-bold text-indigo-700">{formatDuration(bnb.night_hours)}</p>
                                <p className="text-xs text-indigo-600">Night Shift</p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Category breakdown for this BnB */}
                          {Object.keys(bnb.category_hours || {}).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Category Breakdown</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(bnb.category_hours).sort((a, b) => b[1] - a[1]).map(([cat, hrs]) => (
                                  <span key={cat} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm">
                                    {cat}: <strong>{formatDuration(hrs)}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Kit Level View */}
                          {bnb.kits && bnb.kits.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Kit Breakdown</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {bnb.kits.map(kit => (
                                  <div key={kit.kit_id} className="border rounded-lg p-3 bg-slate-50" data-testid={`kit-${kit.kit_id}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <Package className="w-4 h-4 text-slate-400" />
                                      <span className="font-medium text-slate-800 text-sm">{kit.kit_id}</span>
                                    </div>
                                    <p className="text-lg font-bold text-green-600">{formatDuration(kit.total_hours)}</p>
                                    {Object.keys(kit.category_hours || {}).length > 0 && (
                                      <div className="mt-1 text-xs text-slate-500">
                                        {Object.entries(kit.category_hours).map(([c, h]) => (
                                          <span key={c} className="mr-2">{c}: {formatDuration(h)}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Damage & Lost Reports */}
                          {(bnb.damage_reports?.length > 0 || bnb.lost_reports?.length > 0) && (
                            <div className="border-t pt-4">
                              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Issues Reported</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Damage Reports */}
                                {bnb.damage_reports?.length > 0 && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                                      <span className="font-medium text-amber-800 text-sm">Damage Reports ({bnb.damage_reports.length})</span>
                                    </div>
                                    <ul className="space-y-1">
                                      {bnb.damage_reports.map((report, idx) => (
                                        <li key={idx} className="text-xs text-amber-700">
                                          <strong>{report.item}</strong> - {report.notes || 'No details'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {/* Lost Reports */}
                                {bnb.lost_reports?.length > 0 && (
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <XCircle className="w-4 h-4 text-red-600" />
                                      <span className="font-medium text-red-800 text-sm">Lost Items ({bnb.lost_reports.length})</span>
                                    </div>
                                    <ul className="space-y-1">
                                      {bnb.lost_reports.map((report, idx) => (
                                        <li key={idx} className="text-xs text-red-700">
                                          <strong>{report.item}</strong> - {report.notes || 'No details'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
