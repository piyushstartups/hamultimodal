import { useState, useEffect } from 'react';
import api from '../lib/api';
import { format } from 'date-fns';
import { AlertCircle, MapPin, User, Clock, FileText } from 'lucide-react';
import Layout from '../components/Layout';

export default function LostItemsReport() {
  const [lostItems, setLostItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLostItems();
  }, []);

  const fetchLostItems = async () => {
    try {
      const response = await api.get('/reports/lost-items');
      setLostItems(response.data);
    } catch (error) {
      console.error('Failed to fetch lost items:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    return '📦';
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Lost Items Report</h1>
        <p className="text-sm text-slate-600 mt-1">Human Archive - Track all reported lost inventory with full audit trail</p>
      </div>

      {/* Summary Card */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <div>
            <h2 className="text-2xl font-bold text-red-900">{lostItems.length}</h2>
            <p className="text-sm text-red-700 font-medium">Total Lost Items</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading lost items report...</p>
        </div>
      ) : lostItems.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {lostItems.map((item) => (
            <div
              key={item.item_id}
              data-testid={`lost-item-${item.item_id}`}
              className="bg-white rounded-xl border border-red-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-2xl">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 font-data text-lg">{item.item_id}</h3>
                    <p className="text-sm text-slate-600">{item.item_name}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
                  LOST
                </span>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">Reported by:</span>
                  <span className="font-medium text-slate-900">{item.reported_by}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">Reported at:</span>
                  <span className="font-data text-slate-900">
                    {format(new Date(item.reported_at), 'MMM dd, yyyy HH:mm')}
                  </span>
                </div>

                {item.last_known_location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">Last location:</span>
                    <span className="font-data font-medium text-slate-900">{item.last_known_location}</span>
                  </div>
                )}

                {item.category === 'ssd' && item.total_capacity_gb && (
                  <div className="text-sm text-slate-600">
                    Capacity: <span className="font-data font-medium text-slate-900">{item.total_capacity_gb}GB</span>
                  </div>
                )}

                {item.notes && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <span className="text-slate-600 font-medium">Notes:</span>
                        <p className="text-slate-700 mt-1">{item.notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Lost Items</h3>
          <p className="text-slate-600">All inventory is accounted for</p>
        </div>
      )}
    </Layout>
  );
}
