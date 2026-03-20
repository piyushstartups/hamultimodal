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

// Get today's date in YYYY-MM-DD format (IST timezone - operational day)
const getTodayDateString = () => {
  const now = new Date();
  const istOffset = 5.5 * 60; // IST is UTC+5:30
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  
  // Calculate IST date
  let istDate = new Date(now);
  istDate.setUTCMinutes(now.getUTCMinutes() + istOffset);
  
  // If IST hour is before 5 AM, it belongs to previous operational day
  const istHour = Math.floor((utcMinutes + istOffset) / 60) % 24;
  if (istHour < 5) {
    istDate.setUTCDate(istDate.getUTCDate() - 1);
  }
  
  return istDate.toISOString().split('T')[0];
};

export default function LiveDashboard() {
  const { user } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
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
    if (!hours || hours < 0.01) return '0h 0m';
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

  // Calculate elapsed time for active record (correct pause handling)
  const calculateElapsedTime = useCallback((activeRecord) => {
    if (!activeRecord || !activeRecord.start_time) return 0;
    
    const startTime = new Date(activeRecord.start_time).getTime();
    const now = currentTime;
    
    // Calculate total paused time correctly
    let totalPausedMs = 0;
    const pauses = activeRecord.pauses || [];
    
    for (const pause of pauses) {
      const pauseTime = new Date(pause.pause_time).getTime();
      if (pause.resume_time) {
        // Completed pause - add duration
        const resumeTime = new Date(pause.resume_time).getTime();
        totalPausedMs += (resumeTime - pauseTime);
      } else {
        // Currently paused - count time from pause start to now
        totalPausedMs += (now - pauseTime);
      }
    }
    
    // Active time = total elapsed - paused time
    const elapsedMs = now - startTime - totalPausedMs;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }, [currentTime]);

  const changeDate = (days) => {
    const d = new Date(selectedDate + 'T12:00:00'); // Use noon to avoid timezone issues
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
    setLoading(true);
  };

  const toggleBnb = (bnb) => {
    setExpandedBnbs(prev => ({ ...prev, [bnb]: !prev[bnb] }));
  };

  const isToday = selectedDate === getTodayDateString();
  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });

  // Get status badge - compact version
  const getStatusBadge = (activeRecord) => {
    if (!activeRecord) {
      return { color: 'bg-slate-400', label: 'Idle', textColor: 'text-white' };
    }
    if (activeRecord.status === 'active') {
      return { color: 'bg-green-500', label: 'Active', textColor: 'text-white' };
    }
    if (activeRecord.status === 'paused') {
      return { color: 'bg-amber-500', label: 'Paused', textColor: 'text-white' };
    }
    return { color: 'bg-slate-400', label: 'Idle', textColor: 'text-white' };
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" data-testid="back-btn">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </a>
            <div>
              <h1 className="text-base font-bold">Live Dashboard</h1>
              <p className="text-xs text-white/70">{displayDate}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="border-white/30 text-white hover:bg-white/20 h-8 text-xs" data-testid="refresh-btn">
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Date Selector - Compact */}
        <div className="bg-white rounded-lg border p-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => changeDate(-1)} className="h-8 w-8" data-testid="prev-date">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setLoading(true); }}
              className="w-36 h-8 text-sm"
              data-testid="date-picker"
            />
            {!isToday && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setSelectedDate(getTodayDateString()); setLoading(true); }}>
                Today
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => changeDate(1)} disabled={isToday} className="h-8 w-8" data-testid="next-date">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : data ? (
          <>
            {/* TOP LEVEL SUMMARY - Compact */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="bg-green-500 text-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-xs">Total Hours</p>
                    <p className="text-2xl font-bold" data-testid="total-hours-value">{formatDuration(data.total_hours)}</p>
                  </div>
                  {data.active_count > 0 && (
                    <div className="bg-white/20 px-3 py-1.5 rounded text-center">
                      <p className="text-lg font-bold">{data.active_count}</p>
                      <p className="text-xs text-green-100">Active</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Category-wise breakdown - Compact */}
              {data.category_hours && Object.keys(data.category_hours).length > 0 && (
                <div className="px-4 py-2 border-t flex flex-wrap gap-2">
                  {Object.entries(data.category_hours).sort((a, b) => b[1] - a[1]).map(([category, hours]) => (
                    <span key={category} className="bg-slate-100 px-2 py-1 rounded text-xs" data-testid={`category-${category}`}>
                      <strong>{formatDuration(hours)}</strong> {category}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* BNB LEVEL VIEW */}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-2">BnB Breakdown</h2>
              {(!data.bnbs || data.bnbs.length === 0) ? (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-500 text-sm">
                  No deployments for this date
                </div>
              ) : (
                <div className="space-y-3">
                  {data.bnbs.map((bnb) => (
                    <div key={bnb.bnb} className="bg-white rounded-lg border overflow-hidden" data-testid={`bnb-card-${bnb.bnb}`}>
                      {/* BnB Header */}
                      <button
                        onClick={() => toggleBnb(bnb.bnb)}
                        className="w-full bg-slate-800 text-white px-3 py-2 flex items-center justify-between hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span className="font-semibold">{bnb.bnb}</span>
                          {bnb.active_count > 0 && (
                            <span className="text-xs bg-green-500 px-1.5 py-0.5 rounded animate-pulse">
                              {bnb.active_count} active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold text-green-400">{formatDuration(bnb.total_hours)}</span>
                          {expandedBnbs[bnb.bnb] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>
                      
                      {expandedBnbs[bnb.bnb] && (
                        <div className="p-3 space-y-3">
                          {/* Shift Split - Compact */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-2">
                              <Sun className="w-4 h-4 text-amber-500" />
                              <div>
                                <p className="text-sm font-bold text-amber-700">{formatDuration(bnb.morning_hours)}</p>
                                <p className="text-xs text-amber-600">Morning</p>
                              </div>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-200 rounded p-2 flex items-center gap-2">
                              <Moon className="w-4 h-4 text-indigo-500" />
                              <div>
                                <p className="text-sm font-bold text-indigo-700">{formatDuration(bnb.night_hours)}</p>
                                <p className="text-xs text-indigo-600">Night</p>
                              </div>
                            </div>
                          </div>
                          
                          {/* Kit Level View - COMPACT */}
                          {bnb.kits && bnb.kits.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-1">Kits</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {bnb.kits.map(kit => {
                                  const activeRecord = kit.active_record;
                                  const statusBadge = getStatusBadge(activeRecord);
                                  const elapsedSeconds = activeRecord ? calculateElapsedTime(activeRecord) : 0;
                                  
                                  return (
                                    <div 
                                      key={kit.kit_id} 
                                      className={`border rounded-lg p-2 ${
                                        activeRecord?.status === 'active' 
                                          ? 'border-green-400 bg-green-50' 
                                          : activeRecord?.status === 'paused'
                                          ? 'border-amber-400 bg-amber-50'
                                          : 'border-slate-200 bg-white'
                                      }`}
                                      data-testid={`kit-${kit.kit_id}`}
                                    >
                                      {/* Kit Header - Compact */}
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold text-sm text-slate-800">{kit.kit_id}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge.color} ${statusBadge.textColor}`}>
                                          {statusBadge.label}
                                        </span>
                                      </div>
                                      
                                      {/* Timer or Hours */}
                                      {activeRecord ? (
                                        <div className="text-center">
                                          <p 
                                            className={`text-lg font-mono font-bold ${
                                              activeRecord.status === 'active' ? 'text-green-600' : 'text-amber-600'
                                            }`}
                                            data-testid={`timer-${kit.kit_id}`}
                                          >
                                            {formatTimer(elapsedSeconds)}
                                          </p>
                                          <p className="text-xs text-slate-500 truncate">{activeRecord.activity_type}</p>
                                        </div>
                                      ) : (
                                        <div className="text-center">
                                          <p className="text-sm font-bold text-slate-700">{formatDuration(kit.total_hours)}</p>
                                          <p className="text-xs text-slate-400">completed</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {/* Damage & Lost Reports - Compact */}
                          {(bnb.damage_reports?.length > 0 || bnb.lost_reports?.length > 0) && (
                            <div className="border-t pt-2 flex gap-2">
                              {bnb.damage_reports?.length > 0 && (
                                <div className="flex items-center gap-1 text-xs text-amber-600">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{bnb.damage_reports.length} damage</span>
                                </div>
                              )}
                              {bnb.lost_reports?.length > 0 && (
                                <div className="flex items-center gap-1 text-xs text-red-600">
                                  <XCircle className="w-3 h-3" />
                                  <span>{bnb.lost_reports.length} lost</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Last Update - Compact */}
            {lastUpdate && (
              <p className="text-xs text-slate-400 text-center">
                Auto-refresh: 30s • Timers: 1s • Last: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
