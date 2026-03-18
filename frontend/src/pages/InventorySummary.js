import { useState, useEffect } from 'react';
import api from '../lib/api';
import { CheckCircle, XCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';

export default function InventorySummary() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'detailed'

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const [itemsRes, eventsRes] = await Promise.all([
        api.get('/items'),
        api.get('/events')
      ]);
      
      const items = itemsRes.data;
      const events = eventsRes.data;
      
      // Group by item name (not item_id)
      const grouped = {};
      
      items.forEach(item => {
        const name = item.item_name;
        if (!grouped[name]) {
          grouped[name] = {
            name,
            totalOwned: 0,
            lost: 0,
            damaged: 0,
            wearFlags: 0,
            repair: 0,
            hub: 0,
            deployed: 0
          };
        }
        
        grouped[name].totalOwned++;
        
        // Count by status
        if (item.status === 'lost') grouped[name].lost++;
        else if (item.status === 'damaged') grouped[name].damaged++;
        else if (item.status === 'repair') grouped[name].repair++;
        
        // Count by location
        if (item.current_kit?.includes('STATION') || item.current_kit?.includes('DATA-CENTER')) {
          grouped[name].hub++;
        } else if (item.current_kit?.includes('KIT') || item.current_kit?.includes('BNB')) {
          grouped[name].deployed++;
        }
      });
      
      // Convert to array and calculate balance
      const summaryArray = Object.values(grouped).map(item => ({
        ...item,
        balanced: item.totalOwned === (item.deployed + item.hub + item.lost + item.damaged + item.repair)
      }));
      
      setSummary(summaryArray);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-slate-600">Loading inventory summary...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-tactical text-slate-900">Inventory Summary</h1>
            <p className="text-sm text-slate-600 mt-1">Bird's eye view of all inventory</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setViewMode('summary')}
              variant={viewMode === 'summary' ? 'default' : 'outline'}
              className={viewMode === 'summary' ? 'bg-slate-900' : ''}
            >
              Summary View
            </Button>
            <Button
              onClick={() => window.location.href = '/inventory'}
              variant="outline"
            >
              Detailed View
            </Button>
          </div>
        </div>
      </div>

      {/* Bird's Eye Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-500 text-white">
                <th className="px-4 py-3 text-left font-bold font-tactical text-lg border-r border-blue-400">
                  Item Name
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Total Owned
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Lost
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Damaged
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Wear Flags
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Repair
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Hub
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical border-r border-blue-400">
                  Deployed
                </th>
                <th className="px-4 py-3 text-center font-bold font-tactical">
                  Balanced
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.map((item, index) => (
                <tr
                  key={item.name}
                  data-testid={`summary-row-${item.name}`}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}
                >
                  <td className="px-4 py-3 border-r border-slate-200 font-medium text-slate-900">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.totalOwned}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.lost}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.damaged}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.wearFlags}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.repair}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.hub}
                  </td>
                  <td className="px-4 py-3 text-center border-r border-slate-200 font-data font-bold text-lg">
                    {item.deployed}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.balanced ? (
                      <span className="text-green-600 font-semibold flex items-center justify-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold flex items-center justify-center gap-1">
                        <XCircle className="w-4 h-4" />
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="font-semibold font-tactical text-slate-900 mb-3">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium text-slate-700">Hub:</span>
            <p className="text-slate-600">Items at Station/Data Center</p>
          </div>
          <div>
            <span className="font-medium text-slate-700">Deployed:</span>
            <p className="text-slate-600">Items in field (Kits/BnBs)</p>
          </div>
          <div>
            <span className="font-medium text-slate-700">Wear Flags:</span>
            <p className="text-slate-600">Items showing wear (tracked via events)</p>
          </div>
          <div>
            <span className="font-medium text-slate-700">Balanced:</span>
            <p className="text-slate-600">Total matches deployed + hub + issues</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
