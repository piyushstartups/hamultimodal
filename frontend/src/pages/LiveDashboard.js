import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  ArrowLeft, RefreshCw, Clock, ChevronLeft, ChevronRight, 
  ChevronDown, ChevronUp, MapPin, Package, AlertTriangle, 
  XCircle, Sun, Moon, Play, Pause, Users
} from 'lucide-react';

export default function LiveDashboard() {
  const { user } = useAuth();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  // CRITICAL: operationalDate fetched from BACKEND - this is the SINGLE SOURCE OF TRUTH
  const [operationalDate, setOperationalDate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [expandedBnbs, setExpandedBnbs] = useState({});
  const [currentTime, setCurrentTime] = useState(Date.now()); // Only used for live timer calculations

  // CRITICAL: Fetch operational date from BACKEND on mount - this is the SINGLE SOURCE OF TRUTH
  useEffect(() => {
    const fetchOperationalDate = async () => {
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        setSelectedDate(opDate);
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    fetchOperationalDate();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedDate]);

  // Real-time timer update - runs every second (ONLY use of Date.now() - for elapsed time)
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

  // CRITICAL: Use operationalDate from BACKEND as "today" - NOT any local date calculation
  const isToday = selectedDate === operationalDate;
  const displayDate = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  }) : 'Loading...';

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
              value={selectedDate || ''}
              onChange={(e) => { setSelectedDate(e.target.value); setLoading(true); }}
              className="w-36 h-8 text-sm"
              data-testid="date-picker"
            />
            {!isToday && operationalDate && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setSelectedDate(operationalDate); setLoading(true); }}>
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
                        <div className="p-3 space-y-4">
                          {/* MORNING SHIFT SECTION */}
                          <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                            <div className="bg-amber-100 px-3 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Sun className="w-4 h-4 text-amber-600" />
                                <span className="font-semibold text-amber-800">Morning Shift</span>
                              </div>
                              <span className="text-sm font-bold text-amber-700">{formatDuration(bnb.morning_hours)}</span>
                            </div>
                            <div className="p-3 space-y-2">
                              {/* Morning Managers */}
                              {bnb.morning_managers && bnb.morning_managers.length > 0 && (
                                <div className="flex items-center gap-2 text-xs text-amber-700">
                                  <Users className="w-3 h-3" />
                                  <span>Manager: {bnb.morning_managers.join(', ')}</span>
                                </div>
                              )}
                              {/* Morning Kit Hours */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {bnb.kits.map(kit => {
                                  const activeRecord = kit.active_record;
                                  const isActiveInMorning = activeRecord && activeRecord.shift === 'morning';
                                  const currentSessionSeconds = isActiveInMorning ? calculateElapsedTime(activeRecord) : 0;
                                  const morningHours = kit.morning_hours || 0;
                                  
                                  return (
                                    <div 
                                      key={`morning-${kit.kit_id}`}
                                      className={`bg-white border rounded p-2 ${
                                        isActiveInMorning 
                                          ? activeRecord.status === 'active' 
                                            ? 'border-green-400' 
                                            : 'border-amber-400'
                                          : 'border-amber-200'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-xs text-slate-700">{kit.kit_id}</span>
                                        {isActiveInMorning && (
                                          <span className={`text-xs px-1 py-0.5 rounded ${
                                            activeRecord.status === 'active' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
                                          }`}>
                                            {activeRecord.status === 'active' ? 'Active' : 'Paused'}
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-sm font-bold text-center ${
                                        isActiveInMorning 
                                          ? activeRecord.status === 'active' ? 'text-green-700' : 'text-amber-700'
                                          : 'text-amber-800'
                                      }`}>
                                        {formatDuration(morningHours)}
                                      </p>
                                      {/* Live indicator for morning active session */}
                                      {isActiveInMorning && (
                                        <div className={`mt-1 flex items-center justify-center gap-1 text-xs ${
                                          activeRecord.status === 'active' ? 'text-green-600' : 'text-amber-600'
                                        }`}>
                                          {activeRecord.status === 'active' ? (
                                            <Play className="w-2 h-2 animate-pulse" />
                                          ) : (
                                            <Pause className="w-2 h-2" />
                                          )}
                                          <span className="font-mono text-xs">{formatTimer(currentSessionSeconds)}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          
                          {/* NIGHT SHIFT SECTION */}
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg overflow-hidden">
                            <div className="bg-indigo-100 px-3 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Moon className="w-4 h-4 text-indigo-600" />
                                <span className="font-semibold text-indigo-800">Night Shift</span>
                              </div>
                              <span className="text-sm font-bold text-indigo-700">{formatDuration(bnb.night_hours)}</span>
                            </div>
                            <div className="p-3 space-y-2">
                              {/* Night Managers */}
                              {bnb.night_managers && bnb.night_managers.length > 0 && (
                                <div className="flex items-center gap-2 text-xs text-indigo-700">
                                  <Users className="w-3 h-3" />
                                  <span>Manager: {bnb.night_managers.join(', ')}</span>
                                </div>
                              )}
                              {/* Night Kit Hours */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {bnb.kits.map(kit => {
                                  const activeRecord = kit.active_record;
                                  const isActiveInNight = activeRecord && activeRecord.shift !== 'morning';
                                  const currentSessionSeconds = isActiveInNight ? calculateElapsedTime(activeRecord) : 0;
                                  const nightHours = kit.night_hours || 0;
                                  
                                  return (
                                    <div 
                                      key={`night-${kit.kit_id}`}
                                      className={`bg-white border rounded p-2 ${
                                        isActiveInNight 
                                          ? activeRecord.status === 'active' 
                                            ? 'border-green-400' 
                                            : 'border-amber-400'
                                          : 'border-indigo-200'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-xs text-slate-700">{kit.kit_id}</span>
                                        {isActiveInNight && (
                                          <span className={`text-xs px-1 py-0.5 rounded ${
                                            activeRecord.status === 'active' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
                                          }`}>
                                            {activeRecord.status === 'active' ? 'Active' : 'Paused'}
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-sm font-bold text-center ${
                                        isActiveInNight 
                                          ? activeRecord.status === 'active' ? 'text-green-700' : 'text-amber-700'
                                          : 'text-indigo-800'
                                      }`}>
                                        {formatDuration(nightHours)}
                                      </p>
                                      {/* Live indicator for night active session */}
                                      {isActiveInNight && (
                                        <div className={`mt-1 flex items-center justify-center gap-1 text-xs ${
                                          activeRecord.status === 'active' ? 'text-green-600' : 'text-amber-600'
                                        }`}>
                                          {activeRecord.status === 'active' ? (
                                            <Play className="w-2 h-2 animate-pulse" />
                                          ) : (
                                            <Pause className="w-2 h-2" />
                                          )}
                                          <span className="font-mono text-xs">{formatTimer(currentSessionSeconds)}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          
                          {/* TOTAL BNB - Combined hours */}
                          <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-600" />
                                <span className="font-semibold text-slate-700">Total BnB Output</span>
                              </div>
                              <span className="text-lg font-bold text-slate-800">{formatDuration(bnb.total_hours)}</span>
                            </div>
                          </div>
                          
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
