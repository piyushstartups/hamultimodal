import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Package, MapPin, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout';

export default function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/items/inventory');
      setInventory(response.data);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'damaged':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'repair':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Inventory View</h1>
        <p className="text-sm text-slate-600 mt-1">Current state of all items derived from events</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading inventory...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inventory.map((item, index) => (
            <div
              key={index}
              data-testid={`inventory-item-${item.item_id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 font-data">{item.item_id}</h3>
                    <p className="text-sm text-slate-600">{item.item_name}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                {item.current_kit && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-4 h-4" />
                    <span>Location: <span className="font-data font-medium text-slate-900">{item.current_kit}</span></span>
                  </div>
                )}
                {item.quantity && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Package className="w-4 h-4" />
                    <span>Quantity: <span className="font-data font-medium text-slate-900">{item.quantity}</span></span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    Tracking: {item.tracking_type === 'individual' ? 'Individual' : 'Quantity-based'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && inventory.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">No items in inventory</p>
        </div>
      )}
    </Layout>
  );
}