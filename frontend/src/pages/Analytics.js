import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowLeft, RefreshCw, Clock, BarChart3, Activity, TrendingUp, Calendar } from 'lucide-react';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [operationalDate, setOperationalDate] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch operational date from backend on mount
  useEffect(() => {
    const init = async () => {
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        
        // Calculate week ago from operational date
        const today = new Date(opDate + 'T12:00:00');
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);
        
        setEndDate(opDate);
        // Use local date components, NOT toISOString() which converts to UTC
        const startYear = weekAgo.getFullYear();
        const startMonth = String(weekAgo.getMonth() + 1).padStart(2, '0');
        const startDay = String(weekAgo.getDate()).padStart(2, '0');
        setStartDate(`${startYear}-${startMonth}-${startDay}`);
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/analytics?start_date=${startDate}&end_date=${endDate}`);
      setData(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const setQuickRange = (days) => {
    if (!operationalDate) return;
    const end = new Date(operationalDate + 'T12:00:00');
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    // Use local date components, NOT toISOString() which converts to UTC
    const startYear = start.getFullYear();
    const startMonth = String(start.getMonth() + 1).padStart(2, '0');
    const startDay = String(start.getDate()).padStart(2, '0');
    setStartDate(`${startYear}-${startMonth}-${startDay}`);
    setEndDate(operationalDate);
  };

  // Calculate max for bar widths
  const maxActivityHours = data?.hours_per_activity?.length > 0 
    ? Math.max(...data.hours_per_activity.map(a => a.hours)) 
    : 1;
  const maxDailyHours = data?.daily_trend?.length > 0 
    ? Math.max(...data.daily_trend.map(d => d.hours)) 
    : 1;

  const activityColors = {
    cooking: 'bg-orange-500',
    cleaning: 'bg-blue-500',
    organizing: 'bg-purple-500',
    outdoor: 'bg-green-500',
    other: 'bg-slate-500'
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - Mobile optimized */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" data-testid="back-btn">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">Analytics</h1>
              <p className="text-xs sm:text-sm text-slate-600">Data calculated from collection records</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-8 sm:h-9 text-xs sm:text-sm" data-testid="refresh-btn">
            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Date Range Selector - Mobile optimized */}
        <div className="bg-white rounded-xl border p-3 sm:p-4">
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
            <div className="flex gap-2 sm:gap-4">
              <div className="flex-1 sm:flex-none">
                <Label className="text-xs text-slate-500">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full sm:w-40 mt-1 text-sm"
                  data-testid="start-date"
                />
              </div>
              <div className="flex-1 sm:flex-none">
                <Label className="text-xs text-slate-500">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full sm:w-40 mt-1 text-sm"
                  data-testid="end-date"
                />
              </div>
              <Button onClick={fetchData} className="self-end h-9" data-testid="apply-range">Apply</Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:ml-auto">
              <Button variant="outline" size="sm" className="flex-shrink-0 text-xs sm:text-sm" onClick={() => setQuickRange(7)}>Last 7 days</Button>
              <Button variant="outline" size="sm" className="flex-shrink-0 text-xs sm:text-sm" onClick={() => setQuickRange(14)}>Last 14 days</Button>
              <Button variant="outline" size="sm" className="flex-shrink-0 text-xs sm:text-sm" onClick={() => setQuickRange(30)}>Last 30 days</Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading analytics...</div>
        ) : data ? (
          <>
            {/* Summary Cards - Mobile: stack vertically, larger screens: 3 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl border p-4 sm:p-6" data-testid="total-hours-card">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-slate-500">Total Hours Collected</p>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900" data-testid="total-hours-value">
                      {formatDuration(data.total_hours)}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-4 sm:p-6" data-testid="total-deployments-card">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-slate-500">Total Deployments</p>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900" data-testid="total-deployments-value">
                      {data.total_deployments || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border p-4 sm:p-6" data-testid="total-records-card">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-slate-500">Collection Records</p>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900" data-testid="total-records-value">
                      {data.total_collection_records || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours per Activity - Mobile optimized */}
            <div className="bg-white rounded-xl border p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                Hours per Category
              </h2>
              {(!data.hours_per_activity || data.hours_per_activity.length === 0) ? (
                <p className="text-slate-500 text-center py-4 text-sm">No data for selected range</p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {data.hours_per_activity.map((item) => (
                    <div key={item.activity} className="flex items-center gap-2 sm:gap-4" data-testid={`activity-${item.activity}`}>
                      <div className="w-20 sm:w-24 text-xs sm:text-sm font-medium text-slate-700 capitalize truncate">{item.activity}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 sm:h-6 overflow-hidden">
                        <div 
                          className={`${activityColors[item.activity] || 'bg-slate-500'} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${(item.hours / maxActivityHours) * 100}%` }}
                        />
                      </div>
                      <div className="w-16 sm:w-20 text-right font-bold text-slate-900 text-xs sm:text-sm">{formatDuration(item.hours)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Trend - Mobile optimized with horizontal scroll */}
            <div className="bg-white rounded-xl border p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                Daily Trend
              </h2>
              {(!data.daily_trend || data.daily_trend.length === 0) ? (
                <p className="text-slate-500 text-center py-4 text-sm">No data for selected range</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <div className="flex items-end gap-1 h-32 sm:h-40" style={{ minWidth: `${Math.max(data.daily_trend.length * 40, 300)}px` }}>
                    {data.daily_trend.map((day) => {
                      const height = maxDailyHours > 0 ? (day.hours / maxDailyHours) * 100 : 0;
                      const dateObj = new Date(day.date + 'T12:00:00');
                      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-[35px]" data-testid={`day-${day.date}`}>
                          <div className="text-[10px] sm:text-xs font-medium text-slate-600">{day.hours > 0 ? formatDuration(day.hours) : ''}</div>
                          <div className="w-full bg-slate-100 rounded-t flex-1 relative" style={{ minHeight: '20px' }}>
                            <div 
                              className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t transition-all duration-500"
                              style={{ height: `${Math.max(height, day.hours > 0 ? 10 : 0)}%` }}
                            />
                          </div>
                          <div className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Info note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-blue-700">
              All data is automatically calculated from collection records. No manual input is included.
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
