import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Users, 
  MapPin,
  Calendar,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
const CATEGORY_COLORS = {
  cooking: '#F59E0B',
  cleaning: '#10B981',
  organizing: '#3B82F6',
  mixed: '#8B5CF6',
  other: '#6B7280',
  unspecified: '#9CA3AF'
};

export default function AdminAnalytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7'); // days
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [operationalDate, setOperationalDate] = useState('');
  
  // Analytics data
  const [overview, setOverview] = useState(null);
  const [dailyHours, setDailyHours] = useState([]);
  const [bnbPerformance, setBnbPerformance] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [workerPerformance, setWorkerPerformance] = useState([]);
  const [inventoryHealth, setInventoryHealth] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'supervisor') {
      toast.error('Admin access required');
      window.location.href = '/dashboard';
      return;
    }
    
    // Fetch operational date from backend
    const initDates = async () => {
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        
        // Set initial date range based on operational date
        const end = new Date(opDate + 'T12:00:00');
        const start = new Date(end);
        start.setDate(start.getDate() - parseInt(dateRange));
        
        setEndDate(opDate);
        setStartDate(start.toISOString().split('T')[0]);
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    initDates();
  }, [user]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchAllAnalytics();
    }
  }, [startDate, endDate]);

  const handleDateRangeChange = (days) => {
    if (!operationalDate) return;
    setDateRange(days);
    const end = new Date(operationalDate + 'T12:00:00');
    const start = new Date(end);
    start.setDate(start.getDate() - parseInt(days));
    setEndDate(operationalDate);
    setStartDate(start.toISOString().split('T')[0]);
  };

  const fetchAllAnalytics = async () => {
    setLoading(true);
    try {
      const [overviewRes, dailyRes, bnbRes, categoryRes, workerRes, healthRes] = await Promise.all([
        api.get(`/admin/analytics/overview?start_date=${startDate}&end_date=${endDate}`),
        api.get(`/admin/analytics/daily-hours?start_date=${startDate}&end_date=${endDate}`),
        api.get(`/admin/analytics/bnb-performance?start_date=${startDate}&end_date=${endDate}`),
        api.get(`/admin/analytics/category-breakdown?start_date=${startDate}&end_date=${endDate}`),
        api.get(`/admin/analytics/worker-performance?start_date=${startDate}&end_date=${endDate}`),
        api.get(`/admin/analytics/inventory-health?start_date=${startDate}&end_date=${endDate}`),
      ]);
      
      setOverview(overviewRes.data);
      setDailyHours(dailyRes.data);
      setBnbPerformance(bnbRes.data);
      setCategoryBreakdown(categoryRes.data);
      setWorkerPerformance(workerRes.data);
      setInventoryHealth(healthRes.data);
    } catch (error) {
      toast.error('Failed to load analytics');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCategoryData = () => {
    return categoryBreakdown.map(item => ({
      name: item.category.charAt(0).toUpperCase() + item.category.slice(1),
      hours: Math.round(item.total_hours * 10) / 10,
      shifts: item.shift_count,
      fill: CATEGORY_COLORS[item.category] || '#6B7280'
    }));
  };

  const formatHealthData = () => {
    if (!inventoryHealth) return [];
    const { issues } = inventoryHealth;
    return [
      { name: 'Left Glove', wear: issues.left_glove.wear, damaged: issues.left_glove.damaged },
      { name: 'Right Glove', wear: issues.right_glove.wear, damaged: issues.right_glove.damaged },
      { name: 'Head Cam', wear: issues.head_cam.wear, damaged: issues.head_cam.damaged },
    ];
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
            <p className="text-sm text-slate-600 mt-1">Performance metrics and trends</p>
          </div>
          
          {/* Date Range Selector */}
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36"
              />
              <span>to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-slate-300 border-t-slate-900 rounded-full mx-auto"></div>
            <p className="text-slate-600 mt-4">Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Total Hours</p>
                    <p className="text-3xl font-bold text-slate-900">{overview?.total_hours || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Total Shifts</p>
                    <p className="text-3xl font-bold text-slate-900">{overview?.total_shifts || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Active BnBs</p>
                    <p className="text-3xl font-bold text-slate-900">{overview?.active_bnbs || 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Active Workers</p>
                    <p className="text-3xl font-bold text-slate-900">{overview?.unique_workers || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Hours Trend */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Hours Captured</h3>
                {dailyHours.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dailyHours}>
                      <defs>
                        <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}
                        labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="total_hours" 
                        stroke="#3B82F6" 
                        fillOpacity={1} 
                        fill="url(#colorHours)"
                        name="Hours"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400">
                    No data for selected period
                  </div>
                )}
              </div>

              {/* Category Breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Hours by Category</h3>
                {categoryBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={formatCategoryData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="hours"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {formatCategoryData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}
                        formatter={(value, name) => [`${value} hrs`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400">
                    No data for selected period
                  </div>
                )}
              </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* BnB Performance */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance by BnB</h3>
                {bnbPerformance.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bnbPerformance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="bnb_id" type="category" tick={{ fontSize: 12 }} width={80} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}
                      />
                      <Legend />
                      <Bar dataKey="total_hours" fill="#3B82F6" name="Total Hours" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="total_shifts" fill="#10B981" name="Shifts" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400">
                    No data for selected period
                  </div>
                )}
              </div>

              {/* Worker Performance */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Workers</h3>
                {workerPerformance.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {workerPerformance.slice(0, 10).map((worker, index) => (
                      <div key={worker.user_id} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                          index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-700' : 'bg-slate-300'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-900">{worker.name}</span>
                            <span className="text-sm text-slate-600">{worker.total_hours} hrs</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 mt-1">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{ 
                                width: `${Math.min(100, (worker.total_hours / (workerPerformance[0]?.total_hours || 1)) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs text-slate-500">{worker.shift_count} shifts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400">
                    No data for selected period
                  </div>
                )}
              </div>
            </div>

            {/* Inventory Health */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-900">Inventory Health Issues</h3>
                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full ml-2">
                  {inventoryHealth?.total_shifts_with_issues || 0} shifts reported issues
                </span>
              </div>
              
              {inventoryHealth && inventoryHealth.total_shifts_with_issues > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={formatHealthData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}
                    />
                    <Legend />
                    <Bar dataKey="wear" fill="#F59E0B" name="Wear Reported" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="damaged" fill="#EF4444" name="Damaged" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <div className="text-green-500 text-4xl mb-2">✓</div>
                    <p>No inventory issues reported in this period</p>
                  </div>
                </div>
              )}
            </div>

            {/* Category Legend */}
            {categoryBreakdown.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Category Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {formatCategoryData().map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.fill }}></div>
                      <div>
                        <span className="text-sm font-medium text-slate-900">{cat.name}</span>
                        <p className="text-xs text-slate-500">{cat.hours} hrs • {cat.shifts} shifts</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
