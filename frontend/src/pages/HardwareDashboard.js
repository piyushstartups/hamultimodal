import { useState, useEffect, useCallback } from 'react';
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
  ArrowLeft, Camera, Hand, RefreshCw, Package, MapPin, Calendar, User,
  ChevronDown, ChevronUp, Loader2, ImageIcon
} from 'lucide-react';

// Hardware check card component with lazy image loading
const HardwareCheckCard = ({ check, onLoadImages }) => {
  const [expanded, setExpanded] = useState(false);
  const [images, setImages] = useState(null);
  const [loadingImages, setLoadingImages] = useState(false);

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const handleExpand = async () => {
    if (!expanded && !images) {
      // Load images on first expand
      setLoadingImages(true);
      try {
        const loadedImages = await onLoadImages(check.id);
        setImages(loadedImages);
      } catch (error) {
        console.error('Failed to load images:', error);
      } finally {
        setLoadingImages(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden" data-testid={`check-${check.id}`}>
      {/* Check Header - Clickable to expand */}
      <div 
        className="bg-slate-100 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-200 transition-colors"
        onClick={handleExpand}
        data-testid={`check-header-${check.id}`}
      >
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
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            {formatTime(check.created_at)}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <ImageIcon className="w-3 h-3" />
            <span>3</span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>
      
      {/* Expanded Content - Images loaded on demand */}
      {expanded && (
        <div className="p-4">
          {loadingImages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">Loading images...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {/* Left Glove */}
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-2 flex items-center justify-center gap-1">
                    <Hand className="w-3 h-3" /> Left Glove
                  </p>
                  {images?.left_glove_image ? (
                    <img 
                      src={images.left_glove_image} 
                      alt="Left Glove" 
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                      onClick={() => window.open(images.left_glove_image, '_blank')}
                      loading="lazy"
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
                  {images?.right_glove_image ? (
                    <img 
                      src={images.right_glove_image} 
                      alt="Right Glove" 
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                      onClick={() => window.open(images.right_glove_image, '_blank')}
                      loading="lazy"
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
                  {images?.head_camera_image ? (
                    <img 
                      src={images.head_camera_image} 
                      alt="Head Camera" 
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80"
                      onClick={() => window.open(images.head_camera_image, '_blank')}
                      loading="lazy"
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default function HardwareDashboard() {
  const [checks, setChecks] = useState([]);
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Pagination state
  const [totalChecks, setTotalChecks] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentSkip, setCurrentSkip] = useState(0);
  const ITEMS_PER_PAGE = 20;
  
  // Filters - filterDate will be set from backend
  const [filterDate, setFilterDate] = useState('');
  const [filterBnb, setFilterBnb] = useState('all');
  const [filterKit, setFilterKit] = useState('all');

  // Image cache to avoid refetching
  const [imageCache, setImageCache] = useState({});

  // Fetch operational date from backend on mount
  useEffect(() => {
    const init = async () => {
      try {
        const response = await api.get('/system/operational-date');
        setFilterDate(response.data.operational_date);
      } catch (error) {
        console.error('Failed to fetch operational date:', error);
      }
    };
    init();
    fetchData();
  }, []);

  useEffect(() => {
    if (filterDate) {
      // Reset pagination when filters change
      setCurrentSkip(0);
      setChecks([]);
      fetchChecks(0, true);
    }
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

  const fetchChecks = async (skip = 0, isNewSearch = false) => {
    if (isNewSearch) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      let url = `/hardware-checks?date=${filterDate}&skip=${skip}&limit=${ITEMS_PER_PAGE}`;
      if (filterBnb !== 'all') url += `&bnb=${filterBnb}`;
      if (filterKit !== 'all') url += `&kit=${filterKit}`;
      
      const response = await api.get(url);
      const { checks: newChecks, total, has_more } = response.data;
      
      if (isNewSearch) {
        setChecks(newChecks);
      } else {
        setChecks(prev => [...prev, ...newChecks]);
      }
      
      setTotalChecks(total);
      setHasMore(has_more);
      setCurrentSkip(skip + newChecks.length);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreChecks = () => {
    fetchChecks(currentSkip, false);
  };

  const refreshChecks = () => {
    setCurrentSkip(0);
    setChecks([]);
    setImageCache({});
    fetchChecks(0, true);
  };

  // Lazy load images for a specific check
  const loadImages = useCallback(async (checkId) => {
    // Check cache first
    if (imageCache[checkId]) {
      return imageCache[checkId];
    }
    
    try {
      const response = await api.get(`/hardware-checks/${checkId}/images`);
      const images = response.data;
      
      // Cache the images
      setImageCache(prev => ({ ...prev, [checkId]: images }));
      
      return images;
    } catch (error) {
      console.error('Failed to load images for check:', checkId, error);
      return null;
    }
  }, [imageCache]);

  const displayDate = filterDate 
    ? new Date(filterDate + 'T12:00:00').toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
      })
    : 'Loading...';

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
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshChecks} 
            className="border-white/30 text-white hover:bg-white/20" 
            data-testid="refresh-btn"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                Showing <strong>{checks.length}</strong> of <strong>{totalChecks}</strong> checks
              </p>
            </div>
          </div>
        </div>

        {/* Date Header */}
        <div className="flex items-center gap-2 text-slate-700">
          <Calendar className="w-5 h-5" />
          <h2 className="font-semibold">{displayDate}</h2>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Click on a card to expand and view images
        </div>

        {/* Checks List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading checks...
          </div>
        ) : checks.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
            No hardware checks found for this date/filters
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checks.map(check => (
                <HardwareCheckCard 
                  key={check.id} 
                  check={check} 
                  onLoadImages={loadImages}
                />
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={loadMoreChecks}
                  disabled={loadingMore}
                  data-testid="load-more-btn"
                  className="min-w-[200px]"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load More ({totalChecks - checks.length} remaining)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
