import { useState, useEffect } from 'react';
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
  ArrowLeft, Camera, Hand, RefreshCw, Package, MapPin, Calendar, User
} from 'lucide-react';

export default function HardwareDashboard() {
  const [checks, setChecks] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterBnb, setFilterBnb] = useState('all');
  const [filterKit, setFilterKit] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchChecks();
  }, [filterDate, filterBnb, filterKit]);

  const fetchData = async () => {
    try {
      const [bnbsRes, kitsRes] = await Promise.all([
        api.get('/bnbs'),
        api.get('/kits')
      ]);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchChecks = async () => {
    setLoading(true);
    try {
      let url = `/hardware-checks?date=${filterDate}`;
      if (filterBnb !== 'all') url += `&bnb=${filterBnb}`;
      if (filterKit !== 'all') url += `&kit=${filterKit}`;
      
      const response = await api.get(url);
      setChecks(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const displayDate = new Date(filterDate + 'T12:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold">Hardware Dashboard</h1>
              <p className="text-sm text-white/70">Daily equipment health checks</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchChecks} className="border-white/30 text-white hover:bg-white/20" data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-slate-500">Date</Label>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="mt-1"
                data-testid="filter-date"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">BnB</Label>
              <Select value={filterBnb} onValueChange={setFilterBnb}>
                <SelectTrigger className="mt-1" data-testid="filter-bnb">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All BnBs</SelectItem>
                  {bnbs.map(b => (
                    <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Kit</Label>
              <Select value={filterKit} onValueChange={setFilterKit}>
                <SelectTrigger className="mt-1" data-testid="filter-kit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Kits</SelectItem>
                  {kits.map(k => (
                    <SelectItem key={k.kit_id} value={k.kit_id}>{k.kit_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-slate-600">
                <strong>{checks.length}</strong> checks found
              </p>
            </div>
          </div>
        </div>

        {/* Date Header */}
        <div className="flex items-center gap-2 text-slate-700">
          <Calendar className="w-5 h-5" />
          <h2 className="font-semibold">{displayDate}</h2>
        </div>

        {/* Checks List */}
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading...</div>
        ) : checks.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
            No hardware checks found for this date/filters
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checks.map(check => (
              <div key={check.id} className="bg-white rounded-xl border overflow-hidden" data-testid={`check-${check.id}`}>
                {/* Check Header */}
                <div className="bg-slate-100 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-500" />
                      <span className="font-bold">{check.kit}</span>
                    </div>
                    <span className="text-slate-400">•</span>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-600">{check.bnb}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatTime(check.created_at)}
                  </div>
                </div>
                
                {/* Images */}
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-3">
                    {/* Left Glove */}
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
                        <Hand className="w-3 h-3" /> Left Glove
                      </p>
                      {check.left_glove_image ? (
                        <img 
                          src={check.left_glove_image} 
                          alt="Left Glove" 
                          className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                          onClick={() => window.open(check.left_glove_image, '_blank')}
                        />
                      ) : (
                        <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Camera className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                    </div>
                    
                    {/* Right Glove */}
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
                        <Hand className="w-3 h-3 transform scale-x-[-1]" /> Right Glove
                      </p>
                      {check.right_glove_image ? (
                        <img 
                          src={check.right_glove_image} 
                          alt="Right Glove" 
                          className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                          onClick={() => window.open(check.right_glove_image, '_blank')}
                        />
                      ) : (
                        <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Camera className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                    </div>
                    
                    {/* Head Camera */}
                    <div className="text-center">
                      <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
                        <Camera className="w-3 h-3" /> Head Cam
                      </p>
                      {check.head_camera_image ? (
                        <img 
                          src={check.head_camera_image} 
                          alt="Head Camera" 
                          className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                          onClick={() => window.open(check.head_camera_image, '_blank')}
                        />
                      ) : (
                        <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Camera className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Notes */}
                  {check.notes && (
                    <div className="mt-3 p-2 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Notes:</p>
                      <p className="text-sm text-slate-700">{check.notes}</p>
                    </div>
                  )}
                  
                  {/* User info */}
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <User className="w-3 h-3" />
                    Checked by {check.user_name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
