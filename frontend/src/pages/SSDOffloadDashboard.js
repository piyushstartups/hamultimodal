import { useState, useEffect } from 'react';
import api from '../lib/api';
import { format } from 'date-fns';
import { HardDrive, MapPin, User, Clock, TrendingUp, Calendar } from 'lucide-react';
import Layout from '../components/Layout';

export default function SSDOffloadDashboard() {
  const [ssds, setSsds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSSDReport();
  }, []);

  const fetchSSDReport = async () => {
    try {
      const response = await api.get('/reports/ssd-offload');
      setSsds(response.data);
    } catch (error) {
      console.error('Failed to fetch SSD report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSpacePercentage = (ssd) => {
    if (!ssd.last_space_gb || !ssd.total_capacity_gb) return null;
    return Math.round((ssd.last_space_gb / ssd.total_capacity_gb) * 100);
  };

  const getSpaceColor = (percentage) => {
    if (percentage >= 50) return 'text-green-600';
    if (percentage >= 20) return 'text-amber-600';
    return 'text-red-600';
  };

  const totalCapacity = ssds.reduce((sum, ssd) => sum + (ssd.total_capacity_gb || 0), 0);
  const avgDaysAtDC = ssds.length > 0 
    ? Math.round(ssds.reduce((sum, ssd) => sum + ssd.days_at_dc, 0) / ssds.length) 
    : 0;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">SSD Offload Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">Track SSDs at data center for offloading</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold font-tactical text-slate-900">SSDs at DC</h3>
          </div>
          <p className="text-3xl font-bold text-blue-600">{ssds.length}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Total Capacity</h3>
          </div>
          <p className="text-3xl font-bold text-purple-600">{totalCapacity}GB</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold font-tactical text-slate-900">Avg Days at DC</h3>
          </div>
          <p className="text-3xl font-bold text-amber-600">{avgDaysAtDC}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading SSD offload report...</p>
        </div>
      ) : ssds.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ssds.map((ssd) => {
            const spacePercentage = getSpacePercentage(ssd);
            return (
              <div
                key={ssd.item_id}
                data-testid={`ssd-${ssd.item_id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <HardDrive className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 font-data text-lg">{ssd.item_id}</h3>
                      <p className="text-sm text-slate-600">{ssd.item_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    {ssd.days_at_dc} DAYS
                  </span>
                </div>

                {/* Capacity Bar */}
                {spacePercentage !== null && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">Available Space</span>
                      <span className={`text-sm font-bold ${getSpaceColor(spacePercentage)}`}>
                        {ssd.last_space_gb}GB / {ssd.total_capacity_gb}GB ({spacePercentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          spacePercentage >= 50 ? 'bg-green-500' :
                          spacePercentage >= 20 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${spacePercentage}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">From kit:</span>
                    <span className="font-data font-medium text-slate-900">{ssd.from_kit || 'Unknown'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Transferred by:</span>
                    <span className="font-medium text-slate-900">{ssd.transferred_by}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Arrived at DC:</span>
                    <span className="font-data text-slate-900">
                      {format(new Date(ssd.transferred_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>

                  {ssd.last_space_logged_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600">Space last checked:</span>
                      <span className="font-data text-slate-900">
                        {format(new Date(ssd.last_space_logged_at), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                  )}
                </div>

                {spacePercentage !== null && spacePercentage < 20 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 font-medium">⚠️ Low space - Priority offload required</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <HardDrive className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No SSDs at Data Center</h3>
          <p className="text-slate-600">All SSDs are currently deployed in the field</p>
        </div>
      )}
    </Layout>
  );
}
