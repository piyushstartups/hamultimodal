import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  ArrowLeft, RefreshCw, Clock, ChevronLeft, ChevronRight, 
  ChevronDown, ChevronUp, MapPin, Package, AlertTriangle, 
  XCircle, Sun, Moon, Play, Pause
} from 'lucide-react';

export default function LiveDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedBnbs, setExpandedBnbs] = useState({});
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Real-time timer update - runs every second
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

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

  // Format seconds into HH:MM:SS
  const formatTimer = (seconds) => {
    if (seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate elapsed time for active record
  const calculateElapsedTime = useCallback((activeRecord) => {
    if (!activeRecord) return 0;
    
    const startTime = new Date(activeRecord.start_time).getTime();
    const now = currentTime;
    
    // Calculate total paused time
    let totalPausedMs = 0;
    const pauses = activeRecord.pauses || [];
    
    for (const pause of pauses) {
      const pauseTime = new Date(pause.pause_time).getTime();
      if (pause.resume_time) {
        const resumeTime = new Date(pause.resume_time).getTime();
        totalPausedMs += (resumeTime - pauseTime);
      } else {
        // Currently paused - count time from pause to now
        totalPausedMs += (now - pauseTime);
      }
    }
    
    const elapsedMs = now - startTime - totalPausedMs;
    return Math.floor(elapsedMs / 1000);
  }, [currentTime]);

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

  // Get status badge color and label
  const getStatusBadge = (activeRecord) => {
    if (!activeRecord) {
      return { color: 'bg-slate-300', label: 'Idle' };
    }
    if (activeRecord.status === 'active') {
      return { color: 'bg-green-500 animate-pulse', label: 'Active' };
    }
    if (activeRecord.status === 'paused') {
      return { color: 'bg-amber-500', label: 'Paused' };
    }
    return { color: 'bg-slate-300', label: 'Idle' };
  };

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
                          
                          {/* Kit Level View with Real-Time Tracking */}
                          {bnb.kits && bnb.kits.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Kit Status</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {bnb.kits.map(kit => {
                                  const activeRecord = kit.active_record;
                                  const statusBadge = getStatusBadge(activeRecord);
                                  const elapsedSeconds = activeRecord ? calculateElapsedTime(activeRecord) : 0;
                                  
                                  return (
                                    <div 
                                      key={kit.kit_id} 
                                      className={`border-2 rounded-xl p-4 transition-all ${
                                        activeRecord?.status === 'active' 
                                          ? 'border-green-400 bg-green-50' 
                                          : activeRecord?.status === 'paused'
                                          ? 'border-amber-400 bg-amber-50'
                                          : 'border-slate-200 bg-slate-50'
                                      }`}
                                      data-testid={`kit-${kit.kit_id}`}
                                    >
                                      {/* Kit Header */}
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <Package className="w-5 h-5 text-slate-600" />
                                          <span className="font-bold text-lg text-slate-800">{kit.kit_id}</span>
                                        </div>
                                        <span className={`text-xs px-3 py-1 rounded-full text-white font-medium ${statusBadge.color}`}>
                                          {activeRecord?.status === 'active' && <Play className="w-3 h-3 inline mr-1" />}
                                          {activeRecord?.status === 'paused' && <Pause className="w-3 h-3 inline mr-1" />}
                                          {statusBadge.label}
                                        </span>
                                      </div>
                                      
                                      {/* Real-Time Timer for Active/Paused */}
                                      {activeRecord && (
                                        <div className="mb-3 text-center">
                                          <p 
                                            className={`text-3xl font-mono font-bold ${
                                              activeRecord.status === 'active' ? 'text-green-600' : 'text-amber-600'
                                            }`}
                                            data-testid={`timer-${kit.kit_id}`}
                                          >
                                            {formatTimer(elapsedSeconds)}
                                          </p>
                                          <p className="text-xs text-slate-500 mt-1">
                                            {activeRecord.activity_type} • {activeRecord.ssd_used}
                                          </p>
                                          <p className="text-xs text-slate-400">
                                            by {activeRecord.user_name}
                                          </p>
                                        </div>
                                      )}
                                      
                                      {/* Completed Hours Summary */}
                                      <div className="border-t pt-3 mt-2">
                                        <div className="flex items-center justify-between text-sm">
                                          <span className="text-slate-500">Completed Today</span>
                                          <span className="font-bold text-slate-800">{formatDuration(kit.total_hours)}</span>
                                        </div>
                                        {Object.keys(kit.category_hours || {}).length > 0 && (
                                          <div className="mt-1 text-xs text-slate-400">
                                            {Object.entries(kit.category_hours).map(([c, h]) => (
                                              <span key={c} className="mr-2">{c}: {formatDuration(h)}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
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
                Auto-refreshes every 30 seconds • Timers update in real-time • Last API: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
