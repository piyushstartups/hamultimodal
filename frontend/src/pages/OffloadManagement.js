import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  ArrowLeft, HardDrive, Database, Plus, ChevronDown, ChevronRight,
  Package, Clock, MapPin, Users, Calendar, RefreshCw, Loader2,
  CheckCircle2, AlertCircle, ArrowRight, Box, RotateCcw, Trash2
} from 'lucide-react';

const TABS = [
  { id: 'offload', label: 'Offload SSDs', icon: ArrowRight },
  { id: 'tracker', label: 'SSD Tracker', icon: Database },
  { id: 'hdds', label: 'HDD Dashboard', icon: HardDrive },
  { id: 'history', label: 'History', icon: Clock },
];

// Storage progress bar component
const StorageBar = ({ used, total }) => {
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-green-500';
  
  return (
    <div className="w-full">
      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all`} 
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{used.toFixed(0)} GB used</span>
        <span>{(total - used).toFixed(0)} GB free</span>
      </div>
    </div>
  );
};

export default function OffloadManagement() {
  const [activeTab, setActiveTab] = useState('offload');
  const [loading, setLoading] = useState(true);
  
  // Data
  const [ssds, setSsds] = useState([]);
  const [hdds, setHdds] = useState([]);
  const [offloads, setOffloads] = useState([]);
  
  // Offload form state
  const [selectedSsds, setSelectedSsds] = useState([]);
  const [selectedHdd, setSelectedHdd] = useState('');
  const [transferSize, setTransferSize] = useState('');
  const [offloadNotes, setOffloadNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Add HDD dialog
  const [addHddOpen, setAddHddOpen] = useState(false);
  const [newHddId, setNewHddId] = useState('');
  const [newHddCapacity, setNewHddCapacity] = useState('8000');
  
  // Expanded HDDs
  const [expandedHdds, setExpandedHdds] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ssdsRes, hddsRes, offloadsRes] = await Promise.all([
        api.get('/ssds'),
        api.get('/hdds'),
        api.get('/offloads?limit=100')
      ]);
      setSsds(ssdsRes.data);
      setHdds(hddsRes.data);
      setOffloads(offloadsRes.data.offloads || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSsdToggle = (ssdId) => {
    setSelectedSsds(prev => 
      prev.includes(ssdId) 
        ? prev.filter(id => id !== ssdId)
        : [...prev, ssdId]
    );
  };

  const handleCreateOffload = async () => {
    if (selectedSsds.length === 0 || !selectedHdd || !transferSize) {
      toast.error('Please select SSDs, target HDD, and enter transfer size');
      return;
    }
    
    const size = parseFloat(transferSize);
    if (isNaN(size) || size <= 0) {
      toast.error('Please enter a valid transfer size');
      return;
    }
    
    setSubmitting(true);
    try {
      await api.post('/offloads', {
        ssd_ids: selectedSsds,
        hdd_id: selectedHdd,
        transfer_size_gb: size,
        notes: offloadNotes || null
      });
      
      toast.success('Offload completed! SSDs are now available for reuse.');
      
      // Reset form
      setSelectedSsds([]);
      setSelectedHdd('');
      setTransferSize('');
      setOffloadNotes('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create offload');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddHdd = async () => {
    if (!newHddId) {
      toast.error('Please enter HDD ID');
      return;
    }
    
    try {
      await api.post('/hdds', {
        item_id: newHddId,
        total_capacity_gb: parseFloat(newHddCapacity) || 8000
      });
      
      toast.success('HDD added successfully');
      setAddHddOpen(false);
      setNewHddId('');
      setNewHddCapacity('8000');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add HDD');
    }
  };

  const handleResetHdd = async (hddId) => {
    if (!confirm(`Reset ${hddId}? This will clear all storage tracking (used for returned drives from data centre).`)) {
      return;
    }
    
    try {
      await api.post(`/hdds/${hddId}/reset`, { reason: 'returned_from_data_centre' });
      toast.success('HDD reset successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset HDD');
    }
  };

  const handleUpdateStatus = async (hddId, status) => {
    try {
      await api.patch(`/hdds/${hddId}/status?status=${status}`);
      toast.success('Status updated');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const toggleHddExpand = (hddId) => {
    setExpandedHdds(prev => ({ ...prev, [hddId]: !prev[hddId] }));
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Get SSDs with pending data
  const ssdsWithData = ssds.filter(ssd => ssd.has_pending_data);
  const totalPendingHours = ssdsWithData.reduce((sum, ssd) => sum + (ssd.pending_hours || 0), 0);

  // Calculate total selected data
  const selectedSsdData = ssds.filter(ssd => selectedSsds.includes(ssd.item_id));
  const totalSelectedRecords = selectedSsdData.reduce((sum, ssd) => sum + (ssd.pending_record_count || 0), 0);
  const totalSelectedHours = selectedSsdData.reduce((sum, ssd) => sum + (ssd.pending_hours || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/inventory">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold">Data Offload</h1>
              <p className="text-sm text-white/70">SSD → HDD Transfer</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="border-white/30 text-white hover:bg-white/20"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id 
                  ? 'bg-slate-900 text-white' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* OFFLOAD TAB */}
        {activeTab === 'offload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* SSDs Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-800">Select SSDs</h2>
                  {ssdsWithData.length > 0 && (
                    <span className="text-sm text-amber-600">
                      {ssdsWithData.length} with data ({formatDuration(totalPendingHours)})
                    </span>
                  )}
                </div>
                
                {ssds.length === 0 ? (
                  <p className="text-slate-500 text-sm py-4 text-center">
                    No SSDs found in inventory
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {ssds.map(ssd => (
                      <div 
                        key={ssd.item_id}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedSsds.includes(ssd.item_id)
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : ssd.has_pending_data
                              ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                        onClick={() => handleSsdToggle(ssd.item_id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{ssd.item_id}</span>
                          <Checkbox 
                            checked={selectedSsds.includes(ssd.item_id)}
                            onCheckedChange={() => handleSsdToggle(ssd.item_id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {ssd.has_pending_data ? (
                          <div className="text-xs">
                            <p className="text-amber-700 font-medium">
                              {ssd.pending_record_count} records • {formatDuration(ssd.pending_hours)}
                            </p>
                            <p className="text-slate-500 truncate">
                              {ssd.pending_bnbs?.join(', ') || 'No BnB data'}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Available
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Offload Form Column */}
            <div className="space-y-4">
              {/* Selected Summary */}
              {selectedSsds.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-medium text-blue-800 mb-2">Selected</h3>
                  <p className="text-sm text-blue-700">
                    {selectedSsds.length} SSD(s) • {totalSelectedRecords} records • {formatDuration(totalSelectedHours)}
                  </p>
                </div>
              )}

              {/* Target HDD */}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-slate-800 mb-3">Target HDD</h3>
                {hdds.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-slate-500 text-sm mb-2">No HDDs configured</p>
                    <Button size="sm" onClick={() => setAddHddOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add HDD
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {hdds.filter(h => h.status === 'active').map(hdd => (
                      <div 
                        key={hdd.item_id}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedHdd === hdd.item_id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setSelectedHdd(hdd.item_id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-slate-500" />
                            <span className="font-medium text-sm">{hdd.item_id}</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {hdd.available_storage_gb?.toFixed(0) || 0} GB free
                          </span>
                        </div>
                        <StorageBar 
                          used={hdd.used_storage_gb || 0} 
                          total={hdd.total_capacity_gb || 8000} 
                        />
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => setAddHddOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add HDD
                    </Button>
                  </div>
                )}
              </div>

              {/* Transfer Size */}
              <div className="bg-white rounded-xl border p-4">
                <Label className="text-slate-800 font-semibold">Transfer Size (GB)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 500"
                  value={transferSize}
                  onChange={(e) => setTransferSize(e.target.value)}
                  className="mt-2"
                />
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl border p-4">
                <Label className="text-slate-800 font-semibold">Notes (optional)</Label>
                <Textarea
                  placeholder="Any notes about this offload..."
                  value={offloadNotes}
                  onChange={(e) => setOffloadNotes(e.target.value)}
                  className="mt-2"
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleCreateOffload}
                disabled={submitting || selectedSsds.length === 0 || !selectedHdd || !transferSize}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Mark as Offloaded
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* HDD DASHBOARD TAB */}
        {activeTab === 'hdds' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">HDD Storage Dashboard</h2>
              <Button size="sm" onClick={() => setAddHddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add HDD
              </Button>
            </div>
            
            {/* Status Summary Cards */}
            {hdds.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium">In Hub</p>
                  <p className="text-2xl font-bold text-green-700">
                    {hdds.filter(h => !h.status || h.status === 'active').length}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium">Sent to DC</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {hdds.filter(h => h.status === 'sent_to_dc').length}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs text-purple-600 font-medium">At Data Centre</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {hdds.filter(h => h.status === 'at_dc').length}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-600 font-medium">Returned</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {hdds.filter(h => h.status === 'returned').length}
                  </p>
                </div>
              </div>
            )}
            
            {hdds.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <HardDrive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 mb-3">No HDDs configured</p>
                <Button onClick={() => setAddHddOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add First HDD
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {hdds.map(hdd => {
                  const isExpanded = expandedHdds[hdd.item_id];
                  const statusColors = {
                    active: 'bg-green-100 text-green-700',
                    sent_to_dc: 'bg-blue-100 text-blue-700',
                    at_dc: 'bg-purple-100 text-purple-700',
                    returned: 'bg-amber-100 text-amber-700'
                  };
                  const statusLabels = {
                    active: 'In Hub',
                    sent_to_dc: 'Sent to DC',
                    at_dc: 'At Data Centre',
                    returned: 'Returned'
                  };
                  
                  return (
                    <div key={hdd.item_id} className="bg-white rounded-xl border overflow-hidden">
                      {/* HDD Header */}
                      <div 
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                        onClick={() => toggleHddExpand(hdd.item_id)}
                      >
                        <div className="flex items-center gap-4">
                          <HardDrive className="w-6 h-6 text-slate-600" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{hdd.item_id}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${statusColors[hdd.status] || statusColors.active}`}>
                                {statusLabels[hdd.status] || 'In Hub'}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500">
                              {hdd.offload_count || 0} offloads • {formatDuration(hdd.total_hours)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-48">
                            <StorageBar 
                              used={hdd.used_storage_gb || 0} 
                              total={hdd.total_capacity_gb || 8000} 
                            />
                          </div>
                          {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                        </div>
                      </div>
                      
                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 py-4 border-t bg-slate-50">
                          {/* Data Summary */}
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="bg-white rounded-lg p-3 border">
                              <p className="text-xs text-slate-500">Dates</p>
                              <p className="text-sm font-medium">
                                {hdd.data_dates?.length > 0 
                                  ? `${hdd.data_dates[0]} - ${hdd.data_dates[hdd.data_dates.length - 1]}`
                                  : 'No data'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border">
                              <p className="text-xs text-slate-500">BnBs</p>
                              <p className="text-sm font-medium">
                                {hdd.data_bnbs?.join(', ') || 'No data'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-3 border">
                              <p className="text-xs text-slate-500">Kits</p>
                              <p className="text-sm font-medium">
                                {hdd.data_kits?.join(', ') || 'No data'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Status Actions */}
                          <div className="flex flex-wrap gap-2 mb-4">
                            <span className="text-xs text-slate-500 mr-2 self-center">Change Status:</span>
                            {hdd.status !== 'active' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(hdd.item_id, 'active'); }}
                                className="text-green-600 hover:text-green-700 border-green-300"
                              >
                                In Hub
                              </Button>
                            )}
                            {hdd.status !== 'sent_to_dc' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(hdd.item_id, 'sent_to_dc'); }}
                                className="text-blue-600 hover:text-blue-700 border-blue-300"
                              >
                                Sent to DC
                              </Button>
                            )}
                            {hdd.status !== 'at_dc' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(hdd.item_id, 'at_dc'); }}
                                className="text-purple-600 hover:text-purple-700 border-purple-300"
                              >
                                At Data Centre
                              </Button>
                            )}
                            {hdd.status !== 'returned' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(hdd.item_id, 'returned'); }}
                                className="text-amber-600 hover:text-amber-700 border-amber-300"
                              >
                                Returned
                              </Button>
                            )}
                          </div>
                          
                          {/* Reset Action - only show when returned */}
                          {hdd.status === 'returned' && (hdd.used_storage_gb || 0) > 0 && (
                            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-sm text-amber-700 mb-2">
                                This HDD has returned from the data centre. Reset to clear storage tracking and make it ready for new offloads.
                              </p>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleResetHdd(hdd.item_id); }}
                                className="text-amber-700 hover:text-amber-800 border-amber-400"
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Reset HDD Storage
                              </Button>
                            </div>
                          )}
                          
                          {/* Offloads List */}
                          {hdd.offloads?.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Offloads</h4>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {hdd.offloads.slice(0, 5).map(off => (
                                  <div key={off.id} className="bg-white rounded border p-2 text-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">{off.ssd_ids?.join(', ')}</span>
                                      <span className="text-slate-500">{off.transfer_size_gb} GB</span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {off.dates?.join(', ')} • {off.bnbs?.join(', ')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SSD TRACKER TAB - View Only */}
        {activeTab === 'tracker' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">SSD Tracker</h2>
              <span className="text-sm text-slate-500">{ssds.length} SSDs tracked</span>
            </div>
            
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">SSD ID</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Current Location</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Last Offloaded</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Pending Data</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">BnBs Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ssds.map(ssd => {
                    // Find the most recent offload for this SSD
                    const lastOffload = offloads.find(o => o.ssd_ids?.includes(ssd.item_id));
                    
                    return (
                      <tr key={ssd.item_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{ssd.item_id}</td>
                        <td className="px-4 py-3">
                          {ssd.current_location ? (
                            <span className="inline-flex items-center gap-1">
                              {ssd.current_location.includes('kit:') ? (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                  {ssd.current_location.replace('kit:', 'Kit ')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                                  {ssd.current_location.replace('station:', '')}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">Hub</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ssd.has_pending_data ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                              Needs Offload
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                              Available
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {lastOffload ? (
                            new Date(lastOffload.created_at).toLocaleDateString()
                          ) : (
                            <span className="text-slate-400">Never</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ssd.has_pending_data ? (
                            <span className="text-amber-700 font-medium">
                              {ssd.pending_record_count} records • {formatDuration(ssd.pending_hours)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                          {ssd.pending_bnbs?.length > 0 ? (
                            ssd.pending_bnbs.join(', ')
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {ssds.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  No SSDs found in inventory. Add SSDs from the Inventory page.
                </div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800">Offload History</h2>
            
            {offloads.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No offloads yet
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">SSDs</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">HDD</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Size</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {offloads.map(off => (
                      <tr key={off.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          {new Date(off.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {off.ssd_ids?.join(', ')}
                        </td>
                        <td className="px-4 py-3">
                          {off.hdd_id}
                        </td>
                        <td className="px-4 py-3">
                          {off.transfer_size_gb} GB
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {off.record_count} records • {formatDuration(off.total_hours)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {off.created_by_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add HDD Dialog */}
      <Dialog open={addHddOpen} onOpenChange={setAddHddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New HDD</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>HDD ID *</Label>
              <Input
                placeholder="e.g., HDD-001"
                value={newHddId}
                onChange={(e) => setNewHddId(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Total Capacity (GB)</Label>
              <Input
                type="number"
                placeholder="8000"
                value={newHddCapacity}
                onChange={(e) => setNewHddCapacity(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">Default: 8000 GB (8TB)</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddHddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddHdd}>
                Add HDD
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
