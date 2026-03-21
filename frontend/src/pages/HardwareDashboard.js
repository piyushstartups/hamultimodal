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
  ChevronDown, ChevronUp, Loader2, ImageIcon, Sun, Moon, X
} from 'lucide-react';

// Image Lightbox Modal Component
const ImageLightbox = ({ isOpen, imageUrl, imageLabel, onClose }) => {
  if (!isOpen || !imageUrl) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
          data-testid="lightbox-close"
        >
          <X className="w-8 h-8" />
        </button>
        
        {/* Image label */}
        {imageLabel && (
          <p className="absolute -top-10 left-0 text-white text-sm">{imageLabel}</p>
        )}
        
        {/* Image */}
        <img
          src={imageUrl}
          alt={imageLabel || 'Hardware check image'}
          className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

// Hardware check card component with proper expansion isolation
const HardwareCheckCard = ({ check, isExpanded, onToggleExpand, images, loadingImages, onImageClick }) => {
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div 
      className={`bg-white rounded-xl border overflow-hidden transition-all ${
        isExpanded ? 'ring-2 ring-blue-400' : ''
      }`} 
      data-testid={`check-${check.id}`}
    >
      {/* Check Header - Clickable to expand */}
      <div 
        className="bg-slate-100 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-200 transition-colors"
        onClick={() => onToggleExpand(check.id)}
        data-testid={`check-header-${check.id}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            <span className="font-bold">{check.kit}</span>
          </div>
          <span className="text-slate-400">|</span>
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
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>
      
      {/* Expanded Content - Images loaded on demand */}
      {isExpanded && (
        <div className="p-4 border-t border-slate-200">
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
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onImageClick(images.left_glove_image, 'Left Glove'); 
                      }}
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
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onImageClick(images.right_glove_image, 'Right Glove'); 
                      }}
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
                      className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        onImageClick(images.head_camera_image, 'Head Camera'); 
                      }}
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

// Shift Section Component
const ShiftSection = ({ title, icon: Icon, iconColor, bgColor, borderColor, checks, expandedCheckId, onToggleExpand, imageCache, loadingImagesFor, onImageClick }) => {
  // Sort checks by kit number (KIT-01, KIT-02, etc.)
  const sortedChecks = [...checks].sort((a, b) => {
    const numA = parseInt(a.kit.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.kit.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Section Header */}
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${borderColor}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <span className="font-semibold text-slate-800">{title}</span>
        <span className="text-sm text-slate-500">({checks.length} checks)</span>
      </div>
      
      {/* Checks Grid */}
      <div className="p-4">
        {checks.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No hardware checks for this shift</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sortedChecks.map(check => (
              <HardwareCheckCard
                key={check.id}
                check={check}
                isExpanded={expandedCheckId === check.id}
                onToggleExpand={onToggleExpand}
                images={imageCache[check.id]}
                loadingImages={loadingImagesFor === check.id}
                onImageClick={onImageClick}
              />
            ))}
          </div>
        )}
      </div>
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
  const ITEMS_PER_PAGE = 50; // Increased to get all checks for grouping
  
  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterBnb, setFilterBnb] = useState('all');
  const [filterKit, setFilterKit] = useState('all');

  // Image cache
  const [imageCache, setImageCache] = useState({});
  
  // Expansion state - only one card expanded at a time
  const [expandedCheckId, setExpandedCheckId] = useState(null);
  const [loadingImagesFor, setLoadingImagesFor] = useState(null);
  
  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);
  const [lightboxLabel, setLightboxLabel] = useState('');

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
      setCurrentSkip(0);
      setChecks([]);
      setExpandedCheckId(null);
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
    setExpandedCheckId(null);
    fetchChecks(0, true);
  };

  // Toggle expansion - only one card at a time (accordion)
  const handleToggleExpand = useCallback(async (checkId) => {
    if (expandedCheckId === checkId) {
      setExpandedCheckId(null);
    } else {
      setExpandedCheckId(checkId);
      
      if (!imageCache[checkId]) {
        setLoadingImagesFor(checkId);
        try {
          const response = await api.get(`/hardware-checks/${checkId}/images`);
          setImageCache(prev => ({ ...prev, [checkId]: response.data }));
        } catch (error) {
          console.error('Failed to load images:', error);
        } finally {
          setLoadingImagesFor(null);
        }
      }
    }
  }, [expandedCheckId, imageCache]);

  // Open lightbox
  const handleImageClick = (imageUrl, label) => {
    setLightboxImage(imageUrl);
    setLightboxLabel(label);
  };

  // Close lightbox
  const closeLightbox = () => {
    setLightboxImage(null);
    setLightboxLabel('');
  };

  // Group checks by shift
  const groupChecksByShift = (allChecks) => {
    const morning = [];
    const evening = [];
    
    allChecks.forEach(check => {
      // Determine shift based on creation time (before 2pm = morning, after = evening)
      const createdAt = new Date(check.created_at);
      const hour = createdAt.getHours();
      
      if (hour < 14) {
        morning.push(check);
      } else {
        evening.push(check);
      }
    });
    
    return { morning, evening };
  };

  const { morning: morningChecks, evening: eveningChecks } = groupChecksByShift(checks);

  const displayDate = filterDate 
    ? new Date(filterDate + 'T12:00:00').toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
      })
    : 'Loading...';

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Lightbox Modal */}
      <ImageLightbox
        isOpen={!!lightboxImage}
        imageUrl={lightboxImage}
        imageLabel={lightboxLabel}
        onClose={closeLightbox}
      />
      
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
                <strong>{totalChecks}</strong> total checks
              </p>
            </div>
          </div>
        </div>

        {/* Date Header */}
        <div className="flex items-center gap-2 text-slate-700">
          <Calendar className="w-5 h-5" />
          <h2 className="font-semibold">{displayDate}</h2>
        </div>

        {/* Content */}
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
          <div className="space-y-6">
            {/* Morning Shift Section */}
            <ShiftSection
              title="Morning Shift"
              icon={Sun}
              iconColor="text-amber-500"
              bgColor="bg-amber-50"
              borderColor="border-amber-200"
              checks={morningChecks}
              expandedCheckId={expandedCheckId}
              onToggleExpand={handleToggleExpand}
              imageCache={imageCache}
              loadingImagesFor={loadingImagesFor}
              onImageClick={handleImageClick}
            />
            
            {/* Evening Shift Section */}
            <ShiftSection
              title="Evening Shift"
              icon={Moon}
              iconColor="text-indigo-500"
              bgColor="bg-indigo-50"
              borderColor="border-indigo-200"
              checks={eveningChecks}
              expandedCheckId={expandedCheckId}
              onToggleExpand={handleToggleExpand}
              imageCache={imageCache}
              loadingImagesFor={loadingImagesFor}
              onImageClick={handleImageClick}
            />
            
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
          </div>
        )}
      </main>
    </div>
  );
}
