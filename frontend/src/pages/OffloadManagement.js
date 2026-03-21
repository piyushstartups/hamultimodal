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
  CheckCircle2, AlertCircle, ArrowRight, Box
} from 'lucide-react';

const TABS = [
  { id: 'offload', label: 'Create Offload', icon: Plus },
  { id: 'batches', label: 'Offload Batches', icon: Database },
  { id: 'hdds', label: 'HDD Storage', icon: HardDrive },
];

export default function OffloadManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('offload');
  const [loading, setLoading] = useState(true);
  
  // Data
  const [ssds, setSsds] = useState([]);
  const [hdds, setHdds] = useState([]);
  const [batches, setBatches] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  
  // Offload form state
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBnb, setSelectedBnb] = useState('');
  const [selectedSsds, setSelectedSsds] = useState([]);
  const [selectedHdd, setSelectedHdd] = useState('');
  const [offloadNotes, setOffloadNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Batch detail dialog
  const [batchDetailOpen, setBatchDetailOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  
  // Expanded sections
  const [expandedHdds, setExpandedHdds] = useState({});

  useEffect(() => {
    fetchData();
    fetchOperationalDate();
  }, []);

  useEffect(() => {
    if (selectedDate && selectedBnb) {
      fetchSsdStatus();
    }
  }, [selectedDate, selectedBnb]);

  const fetchOperationalDate = async () => {
    try {
      const response = await api.get('/system/operational-date');
      setSelectedDate(response.data.operational_date);
    } catch (error) {
      console.error('Failed to fetch operational date:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bnbsRes, hddsRes, batchesRes] = await Promise.all([
        api.get('/bnbs'),
        api.get('/hdds'),
        api.get('/offload-batches?limit=100')
      ]);
      setBnbs(bnbsRes.data);
      setHdds(hddsRes.data);
      setBatches(batchesRes.data.batches || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSsdStatus = async () => {
    try {
      const response = await api.get(`/ssds/offload-status?date=${selectedDate}&bnb=${selectedBnb}`);
      setSsds(response.data);
    } catch (error) {
      console.error('Failed to fetch SSD status:', error);
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
    if (!selectedDate || !selectedBnb || selectedSsds.length === 0 || !selectedHdd) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await api.post('/offload-batches', {
        date: selectedDate,
        bnb: selectedBnb,
        hdd_id: selectedHdd,
        ssd_ids: selectedSsds,
        notes: offloadNotes || null
      });
      
      toast.success('Offload batch created successfully!');
      
      // Reset form and refresh data
      setSelectedSsds([]);
      setSelectedHdd('');
      setOffloadNotes('');
      fetchData();
      fetchSsdStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create offload batch');
    } finally {
      setSubmitting(false);
    }
  };

  const openBatchDetail = async (batch) => {
    setSelectedBatch(batch);
    setBatchDetailOpen(true);
    
    try {
      const response = await api.get(`/offload-batches/${batch.id}`);
      setBatchDetail(response.data);
    } catch (error) {
      toast.error('Failed to load batch details');
    }
  };

  const toggleHddExpand = (hddId) => {
    setExpandedHdds(prev => ({ ...prev, [hddId]: !prev[hddId] }));
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Get SSDs with pending data
  const pendingSsds = ssds.filter(ssd => ssd.pending_offload);
  const totalPendingHours = pendingSsds.reduce((sum, ssd) => sum + ssd.pending_hours, 0);

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
              <h1 className="text-lg font-bold">Data Offload Management</h1>
              <p className="text-sm text-white/70">SSD → HDD Data Transfer & Tracking</p>
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
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id 
                  ? 'bg-slate-900 text-white' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* CREATE OFFLOAD TAB */}
        {activeTab === 'offload' && (
          <div className="space-y-6">
            {/* Date & BnB Selection */}
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-800 mb-4">1. Select Date & BnB</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>BnB</Label>
                  <Select value={selectedBnb} onValueChange={setSelectedBnb}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select BnB" />
                    </SelectTrigger>
                    <SelectContent>
                      {bnbs.map(bnb => (
                        <SelectItem key={bnb.name} value={bnb.name}>{bnb.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SSD Selection */}
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-800 mb-4">
                2. Select SSDs to Offload
                {pendingSsds.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-amber-600">
                    ({pendingSsds.length} with pending data, {formatDuration(totalPendingHours)} total)
                  </span>
                )}
              </h2>
              
              {!selectedDate || !selectedBnb ? (
                <p className="text-slate-500 text-sm">Select date and BnB first</p>
              ) : ssds.length === 0 ? (
                <p className="text-slate-500 text-sm">No SSDs found</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {ssds.map(ssd => (
                    <div 
                      key={ssd.item_id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedSsds.includes(ssd.item_id)
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : ssd.pending_offload
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
                        />
                      </div>
                      {ssd.pending_offload ? (
                        <div className="text-xs">
                          <p className="text-amber-700 font-medium">
                            {ssd.pending_record_count} records • {formatDuration(ssd.pending_hours)}
                          </p>
                          <p className="text-slate-500">Pending offload</p>
                        </div>
                      ) : (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> No pending data
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* HDD Selection */}
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-800 mb-4">3. Select Target HDD</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {hdds.map(hdd => (
                  <div 
                    key={hdd.item_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedHdd === hdd.item_id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => setSelectedHdd(hdd.item_id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <HardDrive className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">{hdd.item_id}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {hdd.batch_count} batches • {formatDuration(hdd.total_hours)} stored
                    </p>
                    {hdd.current_kit && (
                      <p className="text-xs text-slate-400">Location: {hdd.current_kit}</p>
                    )}
                  </div>
                ))}
                {hdds.length === 0 && (
                  <p className="text-slate-500 text-sm col-span-3">
                    No HDDs found. Add HDDs in Inventory Management first.
                  </p>
                )}
              </div>
            </div>

            {/* Notes & Submit */}
            <div className="bg-white rounded-xl border p-4">
              <h2 className="font-semibold text-slate-800 mb-4">4. Notes & Submit</h2>
              <Textarea
                placeholder="Optional notes about this offload batch..."
                value={offloadNotes}
                onChange={(e) => setOffloadNotes(e.target.value)}
                className="mb-4"
                rows={2}
              />
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  {selectedSsds.length > 0 && selectedHdd && (
                    <span>
                      Offloading <strong>{selectedSsds.length}</strong> SSD(s) to <strong>{selectedHdd}</strong>
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleCreateOffload}
                  disabled={submitting || selectedSsds.length === 0 || !selectedHdd}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Create Offload Batch
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* OFFLOAD BATCHES TAB */}
        {activeTab === 'batches' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">All Offload Batches</h2>
              <span className="text-sm text-slate-500">{batches.length} batches</span>
            </div>
            
            {batches.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No offload batches yet
              </div>
            ) : (
              <div className="grid gap-3">
                {batches.map(batch => (
                  <div 
                    key={batch.id}
                    className="bg-white rounded-xl border p-4 hover:border-slate-300 transition-colors cursor-pointer"
                    onClick={() => openBatchDetail(batch)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Database className="w-5 h-5 text-blue-500" />
                        <span className="font-medium">{batch.id}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        batch.status === 'verified' 
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        {batch.date}
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-4 h-4" />
                        {batch.bnb}
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <HardDrive className="w-4 h-4" />
                        {batch.hdd_id}
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4" />
                        {formatDuration(batch.total_hours)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {batch.ssd_ids?.length || 0} SSDs • {batch.kits_involved?.length || 0} kits • {batch.categories?.join(', ') || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HDD STORAGE TAB */}
        {activeTab === 'hdds' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">HDD Storage Overview</h2>
              <span className="text-sm text-slate-500">{hdds.length} HDDs</span>
            </div>
            
            {hdds.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No HDDs in inventory. Add HDDs via Inventory Management.
              </div>
            ) : (
              <div className="grid gap-4">
                {hdds.map(hdd => {
                  const isExpanded = expandedHdds[hdd.item_id];
                  
                  return (
                    <div key={hdd.item_id} className="bg-white rounded-xl border overflow-hidden">
                      <button
                        onClick={() => toggleHddExpand(hdd.item_id)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-slate-800 text-white hover:bg-slate-700"
                      >
                        <div className="flex items-center gap-3">
                          <HardDrive className="w-5 h-5" />
                          <span className="font-bold">{hdd.item_id}</span>
                          <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                            {hdd.batch_count} batches
                          </span>
                          <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                            {formatDuration(hdd.total_hours)}
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                      
                      {isExpanded && (
                        <div className="p-4">
                          {/* HDD Info */}
                          <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                            <div>
                              <span className="text-slate-500">Status:</span>
                              <span className="ml-2 font-medium">{hdd.status || 'active'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Location:</span>
                              <span className="ml-2 font-medium">{hdd.current_kit || 'Hub'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Data Status:</span>
                              <span className="ml-2 font-medium">{hdd.data_status || 'in_use'}</span>
                            </div>
                          </div>
                          
                          {/* Batches */}
                          <h3 className="font-medium text-slate-700 mb-2">Stored Batches</h3>
                          {hdd.batches?.length === 0 ? (
                            <p className="text-sm text-slate-500">No batches stored on this HDD</p>
                          ) : (
                            <div className="space-y-2">
                              {hdd.batches?.map(batch => (
                                <div 
                                  key={batch.id}
                                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:border-slate-300"
                                  onClick={() => openBatchDetail(batch)}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{batch.date} - {batch.bnb}</span>
                                    <span className="text-sm text-slate-600">{formatDuration(batch.total_hours)}</span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {batch.ssd_ids?.length || 0} SSDs • {batch.kits_involved?.join(', ') || 'N/A'}
                                  </div>
                                </div>
                              ))}
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
      </main>

      {/* Batch Detail Dialog */}
      <Dialog open={batchDetailOpen} onOpenChange={setBatchDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Offload Batch Details
            </DialogTitle>
          </DialogHeader>
          
          {batchDetail ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Batch ID</p>
                  <p className="font-medium">{batchDetail.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Date / BnB</p>
                  <p className="font-medium">{batchDetail.date} • {batchDetail.bnb}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target HDD</p>
                  <p className="font-medium">{batchDetail.hdd_id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Hours</p>
                  <p className="font-medium">{formatDuration(batchDetail.total_hours)}</p>
                </div>
              </div>
              
              {/* SSDs */}
              <div>
                <h3 className="font-medium text-slate-700 mb-2">SSDs Offloaded ({batchDetail.ssd_ids?.length || 0})</h3>
                <div className="flex flex-wrap gap-2">
                  {batchDetail.ssd_ids?.map(ssd => (
                    <span key={ssd} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                      {ssd}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Kits & Managers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-slate-700 mb-2">Kits Involved</h3>
                  <div className="flex flex-wrap gap-2">
                    {batchDetail.kits_involved?.map(kit => (
                      <span key={kit} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-sm flex items-center gap-1">
                        <Box className="w-3 h-3" /> {kit}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-slate-700 mb-2">Deployment Managers</h3>
                  <div className="flex flex-wrap gap-2">
                    {batchDetail.managers_involved?.map(mgr => (
                      <span key={mgr} className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm flex items-center gap-1">
                        <Users className="w-3 h-3" /> {mgr}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Categories */}
              <div>
                <h3 className="font-medium text-slate-700 mb-2">Activity Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {batchDetail.categories?.map(cat => (
                    <span key={cat} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Collection Records */}
              <div>
                <h3 className="font-medium text-slate-700 mb-2">
                  Collection Records ({batchDetail.collection_records?.length || 0})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {batchDetail.collection_records?.map(record => (
                    <div key={record.id} className="p-2 bg-slate-50 rounded border text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{record.kit} • {record.activity_type}</span>
                        <span className="text-slate-600">{formatDuration(record.total_duration_hours)}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {record.user_name} • SSD: {record.ssd_used}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Created Info */}
              <div className="text-xs text-slate-500 pt-2 border-t">
                Created by {batchDetail.created_by_name} on {new Date(batchDetail.created_at).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
