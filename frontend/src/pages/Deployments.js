import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
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
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Edit, Trash2, 
  MapPin, Package, Users, Play, Pause, Square, Timer, 
  ChevronDown, ChevronUp, RefreshCw, ClipboardCheck, AlertCircle, Eye,
  Camera, Hand, CheckCircle, Cpu, Sun, Moon
} from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'cooking', label: 'Cooking' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'organizing', label: 'Organizing' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'other', label: 'Other' },
];

// Image compression utility - resizes and compresses images before upload
const compressImage = (file, maxWidth = 1280, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to compressed JPEG
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Background image upload with retry
const uploadImageWithRetry = async (apiCall, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await apiCall();
      return true;
    } catch (error) {
      console.warn(`Upload attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        console.error('All upload attempts failed');
        return false;
      }
      // Wait before retry (exponential backoff)
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
};

// Create a date object for a specific YYYY-MM-DD string (noon to avoid timezone issues)
const createDateFromString = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

// Handover checklist items for each kit
const KIT_CHECKLIST_ITEMS = [
  { key: 'gloves', label: 'Gloves' },
  { key: 'usb_hub', label: 'USB Hub' },
  { key: 'imus', label: 'IMUs' },
  { key: 'head_camera', label: 'Head Camera' },
  { key: 'l_shaped_wire', label: 'L-Shaped Wire' },
  { key: 'laptop', label: 'Laptop' },
  { key: 'laptop_charger', label: 'Laptop Charger' },
  { key: 'power_bank', label: 'Power Bank' },
  { key: 'ssds', label: 'SSDs' },
];

// Shared BnB items
const BNB_CHECKLIST_ITEMS = [
  { key: 'charging_station', label: 'Charging Station' },
  { key: 'power_strip_8_port', label: '8 Port Power Strip' },
  { key: 'power_strip_4_5_port', label: '4-5 Port Strip' },
];

export default function Deployments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'deployment_manager';
  
  // CRITICAL: operationalDate is fetched from BACKEND - this is the SINGLE SOURCE OF TRUTH
  const [operationalDate, setOperationalDate] = useState(null); // YYYY-MM-DD string from backend
  const [dateError, setDateError] = useState(null); // Error state if operational date fetch fails
  const [currentMonth, setCurrentMonth] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDeployment, setExpandedDeployment] = useState(null);
  const [kitShifts, setKitShifts] = useState({});
  
  // Shift control state
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedKit, setSelectedKit] = useState(null);
  const [selectedDeploymentForShift, setSelectedDeploymentForShift] = useState(null);
  const [shiftFormData, setShiftFormData] = useState({ ssd_used: '', activity_type: '' });
  const [shiftLoading, setShiftLoading] = useState(false);
  
  // Handover state
  const [handoverDialogOpen, setHandoverDialogOpen] = useState(false);
  const [handoverType, setHandoverType] = useState('outgoing');
  const [handoverDeployment, setHandoverDeployment] = useState(null);
  const [handoverShiftType, setHandoverShiftType] = useState('morning'); // NEW: which shift is doing handover
  const [kitChecklists, setKitChecklists] = useState({});
  const [bnbChecklist, setBnbChecklist] = useState({});
  const [missingItems, setMissingItems] = useState([]);
  const [handoverNotes, setHandoverNotes] = useState('');
  
  // NEW: Shift tab state (per deployment) - tracks which tab user is viewing
  const [activeShiftTab, setActiveShiftTab] = useState({}); // {deploymentId: 'morning' | 'evening'}
  const [handoverStatus, setHandoverStatus] = useState({}); // {deploymentId: {morning_outgoing_complete, etc.}}
  
  // Timer state
  const [elapsedTimes, setElapsedTimes] = useState({});
  
  // Hardware check state - NOW SHIFT-SPECIFIC
  const [hardwareCheckDialog, setHardwareCheckDialog] = useState(false);
  const [hardwareCheckKit, setHardwareCheckKit] = useState(null);
  const [hardwareCheckDeployment, setHardwareCheckDeployment] = useState(null);
  const [hardwareCheckShiftType, setHardwareCheckShiftType] = useState(null); // Track which shift the check is for
  const [hardwareCheckStatus, setHardwareCheckStatus] = useState({}); // {kit: {morning: bool, evening: bool}}
  const [hardwareImages, setHardwareImages] = useState({
    leftGlove: '',
    rightGlove: '',
    headCamera: ''
  });
  const [hardwareImageFiles, setHardwareImageFiles] = useState({
    leftGlove: null,
    rightGlove: null,
    headCamera: null
  }); // Store raw files for async upload
  const [hardwareNotes, setHardwareNotes] = useState('');
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState({}); // Track background uploads {checkId: status}
  
  // Options
  const [bnbs, setBnbs] = useState([]);
  const [kits, setKits] = useState([]);
  const [managers, setManagers] = useState([]);
  const [items, setItems] = useState([]);
  
  // Admin deployment dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [formData, setFormData] = useState({
    bnb: '',
    morning_managers: [],
    evening_managers: [],
    assigned_kits: [],
  });

  // CRITICAL: Fetch operational date from BACKEND on mount - this is the SINGLE SOURCE OF TRUTH
  // NO FALLBACK to new Date() - retry or show error state instead
  useEffect(() => {
    const fetchOperationalDate = async (retryCount = 0) => {
      const MAX_RETRIES = 3;
      try {
        const response = await api.get('/system/operational-date');
        const opDate = response.data.operational_date;
        setOperationalDate(opDate);
        setDateError(null);
        
        // Initialize calendar and selected date from backend's operational date
        const dateObj = createDateFromString(opDate);
        setCurrentMonth(dateObj);
        setSelectedDate(dateObj);
      } catch (error) {
        console.error(`Failed to fetch operational date (attempt ${retryCount + 1}):`, error);
        if (retryCount < MAX_RETRIES) {
          // Retry after 1 second
          setTimeout(() => fetchOperationalDate(retryCount + 1), 1000);
        } else {
          // After max retries, show error state - DO NOT fallback to new Date()
          setDateError('Unable to load operational date. Please refresh the page.');
        }
      }
    };
    fetchOperationalDate();
  }, []);

  useEffect(() => {
    if (currentMonth) {
      fetchDeployments();
      fetchOptions();
    }
  }, [currentMonth]);

  // Auto-expand first deployment for managers when date changes
  useEffect(() => {
    if (isManager && selectedDate) {
      const dateKey = formatDateKey(selectedDate);
      const todayDeps = deployments.filter(d => d.date === dateKey);
      const myDeps = todayDeps.filter(d => 
        d.deployment_managers?.includes(user?.id) || d.deployment_manager === user?.id
      );
      if (myDeps.length === 1) {
        // Auto-expand if only one deployment for manager
        setExpandedDeployment(myDeps[0].id);
        fetchKitShifts(myDeps[0].id);
      }
    }
  }, [selectedDate, deployments, isManager, user]);

  // Timer effect - updated for new data structure with multiple records
  useEffect(() => {
    const interval = setInterval(() => {
      const newElapsed = {};
      Object.entries(kitShifts).forEach(([kit, kitData]) => {
        const activeRecord = kitData?.active_record;
        if (activeRecord && activeRecord.status === 'active') {
          const startTime = new Date(activeRecord.start_time);
          const now = new Date();
          const pausedSeconds = activeRecord.total_paused_seconds || 0;
          const elapsed = Math.floor((now - startTime) / 1000) - pausedSeconds;
          newElapsed[kit] = Math.max(0, elapsed);
        } else if (activeRecord && activeRecord.status === 'paused') {
          const startTime = new Date(activeRecord.start_time);
          const pauses = activeRecord.pauses || [];
          let totalPaused = 0;
          for (const p of pauses) {
            if (p.resume_time) {
              totalPaused += (new Date(p.resume_time) - new Date(p.pause_time)) / 1000;
            }
          }
          const lastPause = pauses[pauses.length - 1];
          if (lastPause && !lastPause.resume_time) {
            const activeTime = Math.floor((new Date(lastPause.pause_time) - startTime) / 1000) - totalPaused;
            newElapsed[kit] = Math.max(0, activeTime);
          }
        }
      });
      setElapsedTimes(newElapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [kitShifts]);

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/deployments');
      setDeployments(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [bnbsRes, kitsRes, usersRes, itemsRes] = await Promise.all([
        api.get('/bnbs'),
        api.get('/kits'),
        api.get('/users'),
        api.get('/items')
      ]);
      setBnbs(bnbsRes.data);
      setKits(kitsRes.data);
      setManagers(usersRes.data.filter(u => u.role === 'deployment_manager'));
      setItems(itemsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchKitShifts = async (deploymentId) => {
    try {
      const response = await api.get(`/shifts/by-deployment/${deploymentId}`);
      setKitShifts(response.data);
      
      // Also fetch hardware check status for all kits (SHIFT-SPECIFIC)
      const deployment = deployments.find(d => d.id === deploymentId);
      if (deployment?.assigned_kits) {
        const statusPromises = deployment.assigned_kits.map(kit =>
          api.get(`/hardware-checks/status/${deploymentId}/${kit}`)
            .then(res => ({ 
              kit, 
              morning: res.data.morning_completed || false,
              evening: res.data.evening_completed || false
            }))
            .catch(() => ({ kit, morning: false, evening: false }))
        );
        const statuses = await Promise.all(statusPromises);
        const statusMap = {};
        statuses.forEach(s => { 
          statusMap[s.kit] = { morning: s.morning, evening: s.evening }; 
        });
        setHardwareCheckStatus(statusMap);
      }
      
      // Fetch handover status
      if (deployment) {
        fetchHandoverStatus(deploymentId, deployment.date);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // NEW: Fetch handover status for a deployment
  const fetchHandoverStatus = async (deploymentId, date) => {
    try {
      const response = await api.get(`/handovers/status/${deploymentId}/${date}`);
      setHandoverStatus(prev => ({ ...prev, [deploymentId]: response.data }));
    } catch (error) {
      console.error('Failed to fetch handover status:', error);
    }
  };

  // NEW: Check if user belongs to a specific shift
  const getUserShiftAccess = (deployment) => {
    const userId = user?.id;
    const userRole = user?.role;
    
    console.log('[ACCESS_CHECK] getUserShiftAccess called', { 
      userId, 
      userRole,
      isAdmin,
      deploymentId: deployment?.id,
      morningManagers: deployment?.morning_managers,
      eveningManagers: deployment?.evening_managers,
      deploymentManagers: deployment?.deployment_managers
    });
    
    if (!userId || !deployment) {
      console.log('[ACCESS_CHECK] No user or deployment - DENYING');
      return { canMorning: false, canNight: false };
    }
    
    // Admins can access both shifts
    if (isAdmin) {
      console.log('[ACCESS_CHECK] User is ADMIN - GRANTING both shifts');
      return { canMorning: true, canNight: true };
    }
    
    const isMorningManager = deployment.morning_managers?.includes(userId);
    const isNightManager = deployment.evening_managers?.includes(userId);
    // Legacy support
    const isLegacyManager = deployment.deployment_managers?.includes(userId);
    
    const access = {
      canMorning: isMorningManager || isLegacyManager,
      canNight: isNightManager || isLegacyManager
    };
    
    console.log('[ACCESS_CHECK] Non-admin access result', { 
      isMorningManager, 
      isNightManager, 
      isLegacyManager, 
      access 
    });
    
    return access;
  };

  // NEW: Get current tab for a deployment (default based on user access)
  const getActiveTab = (deployment) => {
    const currentTab = activeShiftTab[deployment.id];
    if (currentTab) return currentTab;
    
    // Default: morning if user has morning access, else evening
    const access = getUserShiftAccess(deployment);
    if (access.canMorning) return 'morning';
    if (access.canNight) return 'evening';
    return 'morning'; // Fallback
  };

  // NEW: Check if actions are allowed based on handover status
  const canPerformAction = (deployment, shiftTab, actionType) => {
    const status = handoverStatus[deployment.id];
    const access = getUserShiftAccess(deployment);
    
    // Must have access to the shift tab
    if (shiftTab === 'morning' && !access.canMorning) return { allowed: false, reason: 'Not assigned to morning shift' };
    if (shiftTab === 'evening' && !access.canNight) return { allowed: false, reason: 'Not assigned to night shift' };
    
    if (!status) return { allowed: true, reason: null }; // Status not loaded yet, allow
    
    if (shiftTab === 'morning') {
      // Morning team can always start/stop within their shift
      return { allowed: true, reason: null };
    } else {
      // Night team needs morning handover to start
      if (actionType === 'start' && !status.morning_outgoing_complete) {
        return { allowed: false, reason: 'Morning team must complete handover first' };
      }
      return { allowed: true, reason: null };
    }
  };

  // Hardware check functions - SHIFT-SPECIFIC
  const checkHardwareRequired = async (deployment, kit, currentShiftTab) => {
    // FIX: Standardize shift type to "morning" or "night"
    const shiftType = currentShiftTab === 'evening' ? 'night' : 'morning';
    
    console.log('[HARDWARE_CHECK_REQ] checkHardwareRequired', { deploymentId: deployment.id, kit, shiftType });
    
    try {
      const response = await api.get(`/hardware-checks/status/${deployment.id}/${kit}?shift_type=${shiftType}`);
      return !response.data.completed;
    } catch {
      return true;
    }
  };

  const openHardwareCheckDialog = (deployment, kit, shiftType) => {
    console.log('[HARDWARE_CHECK] Opening dialog', { deploymentId: deployment?.id, kit, shiftType });
    
    if (!deployment || !kit || !shiftType) {
      console.error('[HARDWARE_CHECK] Missing required params', { deployment, kit, shiftType });
      toast.error('Error opening hardware check');
      return;
    }
    
    setHardwareCheckDeployment(deployment);
    setHardwareCheckKit(kit);
    setHardwareCheckShiftType(shiftType); // Store the shift type
    setHardwareImages({ leftGlove: '', rightGlove: '', headCamera: '' });
    setHardwareImageFiles({ leftGlove: null, rightGlove: null, headCamera: null });
    setHardwareNotes('');
    setHardwareCheckDialog(true);
    
    console.log('[HARDWARE_CHECK] Dialog state set', { hardwareCheckDialog: true });
  };

  const handleImageUpload = async (field, e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      // Store original file for later upload
      setHardwareImageFiles(prev => ({ ...prev, [field]: file }));
      
      // Compress image for preview (quick operation)
      const compressedBase64 = await compressImage(file, 1280, 0.7);
      setHardwareImages(prev => ({ ...prev, [field]: compressedBase64 }));
    } catch (error) {
      console.error('Image compression error:', error);
      // Fallback to regular base64 if compression fails
      const reader = new FileReader();
      reader.onloadend = () => {
        setHardwareImages(prev => ({ ...prev, [field]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Background upload function - runs after user proceeds
  const uploadImagesInBackground = async (checkId, images) => {
    setPendingUploads(prev => ({ ...prev, [checkId]: 'uploading' }));
    
    try {
      // Upload all images in parallel
      const uploadPromises = [];
      
      if (images.leftGlove) {
        uploadPromises.push(
          uploadImageWithRetry(() => 
            api.patch(`/hardware-checks/${checkId}/images`, { 
              hardware_check_id: checkId,
              left_glove_image: images.leftGlove 
            })
          )
        );
      }
      if (images.rightGlove) {
        uploadPromises.push(
          uploadImageWithRetry(() => 
            api.patch(`/hardware-checks/${checkId}/images`, { 
              hardware_check_id: checkId,
              right_glove_image: images.rightGlove 
            })
          )
        );
      }
      if (images.headCamera) {
        uploadPromises.push(
          uploadImageWithRetry(() => 
            api.patch(`/hardware-checks/${checkId}/images`, { 
              hardware_check_id: checkId,
              head_camera_image: images.headCamera 
            })
          )
        );
      }
      
      const results = await Promise.all(uploadPromises);
      const allSucceeded = results.every(r => r === true);
      
      setPendingUploads(prev => ({ 
        ...prev, 
        [checkId]: allSucceeded ? 'complete' : 'failed' 
      }));
      
      if (!allSucceeded) {
        console.warn('Some image uploads failed for check:', checkId);
      }
    } catch (error) {
      console.error('Background upload error:', error);
      setPendingUploads(prev => ({ ...prev, [checkId]: 'failed' }));
    }
  };

  const submitHardwareCheck = async () => {
    if (!hardwareImages.leftGlove || !hardwareImages.rightGlove || !hardwareImages.headCamera) {
      toast.error('Please upload all three images (left glove, right glove, head camera)');
      return;
    }
    
    setHardwareLoading(true);
    try {
      // Step 1: Create record with SHIFT-SPECIFIC data
      const response = await api.post('/hardware-checks', {
        deployment_id: hardwareCheckDeployment.id,
        kit: hardwareCheckKit,
        shift_type: hardwareCheckShiftType, // Include shift type
        left_glove_image: hardwareImages.leftGlove,
        right_glove_image: hardwareImages.rightGlove,
        head_camera_image: hardwareImages.headCamera,
        notes: hardwareNotes || null
      });
      
      const checkId = response.data.id;
      const shiftLabel = hardwareCheckShiftType === 'morning' ? 'Morning' : 'Night';
      
      // Step 2: Immediately update UI with shift-specific status
      toast.success(`Hardware check submitted for ${shiftLabel} shift! You can start collection now.`);
      setHardwareCheckDialog(false);
      
      // Update shift-specific status
      setHardwareCheckStatus(prev => ({
        ...prev,
        [hardwareCheckKit]: {
          ...prev[hardwareCheckKit],
          [hardwareCheckShiftType]: true
        }
      }));
      
      // Step 3: Open shift start dialog immediately (non-blocking)
      openStartShift(hardwareCheckDeployment, hardwareCheckKit);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit hardware check');
    } finally {
      setHardwareLoading(false);
    }
  };

  const toggleDeploymentExpand = (dep) => {
    if (expandedDeployment === dep.id) {
      setExpandedDeployment(null);
      setKitShifts({});
    } else {
      setExpandedDeployment(dep.id);
      fetchKitShifts(dep.id);
    }
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const formatDateKey = (date) => {
    if (!date) return null;
    // CRITICAL: Use local date components, NOT toISOString() which converts to UTC
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDeploymentsForDate = (date) => {
    const dateKey = formatDateKey(date);
    let deps = deployments.filter(d => d.date === dateKey);
    if (isManager) {
      // FIX: Check if user is in morning_managers OR evening_managers OR legacy deployment_managers
      deps = deps.filter(d => 
        d.morning_managers?.includes(user?.id) || 
        d.evening_managers?.includes(user?.id) ||
        d.deployment_managers?.includes(user?.id) || 
        d.deployment_manager === user?.id
      );
    }
    return deps;
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    setSelectedDate(null);
    setExpandedDeployment(null);
    setCalendarCollapsed(false);
  };

  const selectDate = (day) => {
    setSelectedDate(day);
    setExpandedDeployment(null);
    setKitShifts({});
    // Auto-collapse calendar when date selected for all users
    setCalendarCollapsed(true);
  };

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '--:--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Shift control functions - EMERGENCY: ALWAYS OPEN DIALOG
  const openStartShift = async (dep, kit) => {
    console.log('[START_COLLECTION] Opening dialog', { 
      deploymentId: dep?.id, 
      kit, 
      timestamp: new Date().toISOString() 
    });
    
    if (!dep || !kit) {
      console.error('[START_COLLECTION] ERROR: Missing dep or kit');
      toast.error('Error: Cannot start - missing deployment or kit');
      return;
    }
    
    // Determine current shift type from the active tab
    const currentShiftTab = activeShiftTab[dep.id] || 'morning';
    const shiftType = currentShiftTab === 'evening' ? 'evening' : 'morning';
    
    // Check if hardware check is already done for THIS kit + THIS shift
    const kitStatus = hardwareCheckStatus[kit] || {};
    const isHardwareCheckDone = shiftType === 'morning' 
      ? kitStatus.morning 
      : (kitStatus.evening || kitStatus.night);
    
    console.log('[START_COLLECTION] Hardware check status', { 
      kit, 
      shiftType, 
      kitStatus, 
      isHardwareCheckDone 
    });
    
    if (!isHardwareCheckDone) {
      // Hardware check NOT done for this shift - open hardware check dialog first
      console.log('[START_COLLECTION] Hardware check required - opening hardware check dialog');
      openHardwareCheckDialog(dep, kit, shiftType);
    } else {
      // Hardware check already done - go directly to start collection form
      console.log('[START_COLLECTION] Hardware check already done - opening shift form');
      setSelectedDeploymentForShift(dep);
      setSelectedKit(kit);
      setShiftFormData({ ssd_used: '', activity_type: '' });
      setShiftDialogOpen(true);
    }
  };

  const handleStartShift = async (e) => {
    e.preventDefault();
    if (!shiftFormData.ssd_used || !shiftFormData.activity_type) {
      toast.error('SSD and Activity Type are required');
      return;
    }
    
    // Determine the shift type from the active tab
    const currentShiftTab = activeShiftTab[selectedDeploymentForShift?.id] || 'morning';
    const shiftType = currentShiftTab === 'evening' ? 'evening' : 'morning';
    
    setShiftLoading(true);
    try {
      await api.post('/shifts/start', {
        deployment_id: selectedDeploymentForShift.id,
        kit: selectedKit,
        ssd_used: shiftFormData.ssd_used,
        activity_type: shiftFormData.activity_type,
        shift: shiftType  // Include shift type for proper aggregation
      });
      toast.success('Collection started!');
      setShiftDialogOpen(false);
      fetchKitShifts(selectedDeploymentForShift.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start collection');
    } finally {
      setShiftLoading(false);
    }
  };

  const handlePauseShift = async (kit) => {
    const kitData = kitShifts[kit];
    const activeRecord = kitData?.active_record;
    if (!activeRecord) {
      toast.error('No active collection found for this kit');
      return;
    }
    try {
      const response = await api.post(`/shifts/${activeRecord.id}/pause`);
      toast.success('Collection paused');
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pause');
    }
  };

  const handleResumeShift = async (kit) => {
    const kitData = kitShifts[kit];
    const activeRecord = kitData?.active_record;
    if (!activeRecord) {
      toast.error('No paused collection found for this kit');
      return;
    }
    try {
      const response = await api.post(`/shifts/${activeRecord.id}/resume`);
      toast.success('Collection resumed');
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resume');
    }
  };

  const handleStopShift = async (kit) => {
    const kitData = kitShifts[kit];
    const activeRecord = kitData?.active_record;
    if (!activeRecord) {
      toast.error('No active collection found for this kit');
      return;
    }
    if (!confirm('Stop this collection? Duration will be calculated automatically.')) return;
    
    try {
      const response = await api.post(`/shifts/${activeRecord.id}/stop`);
      const completedRecord = response.data;
      
      toast.success(`Collection completed! Duration: ${formatDuration(completedRecord.total_duration_hours)}`);
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      console.error('Stop collection error:', error);
      toast.error(error.response?.data?.detail || 'Failed to stop collection');
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!confirm('Delete this collection record?')) return;
    
    try {
      await api.delete(`/shifts/${recordId}`);
      toast.success('Collection record deleted');
      
      if (expandedDeployment) {
        await fetchKitShifts(expandedDeployment);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    }
  };

  // Handover functions
  const openHandoverDialog = (dep, type, shiftType = 'morning') => {
    setHandoverDeployment(dep);
    setHandoverType(type);
    setHandoverShiftType(shiftType);
    
    // Initialize kit checklists
    const initialKitChecklists = {};
    (dep.assigned_kits || []).forEach(kit => {
      initialKitChecklists[kit] = {};
      KIT_CHECKLIST_ITEMS.forEach(item => {
        initialKitChecklists[kit][item.key] = 0;
      });
    });
    setKitChecklists(initialKitChecklists);
    
    // Initialize BnB checklist
    const initialBnbChecklist = {};
    BNB_CHECKLIST_ITEMS.forEach(item => {
      initialBnbChecklist[item.key] = 0;
    });
    setBnbChecklist(initialBnbChecklist);
    
    setMissingItems([]);
    setHandoverNotes('');
    setHandoverDialogOpen(true);
  };

  // NEW: End Shift handler - checks for active collections first
  const handleEndShift = (dep, shiftType) => {
    // Check if any kit has active collection
    const activeKits = (dep.assigned_kits || []).filter(kit => {
      const kitData = kitShifts[kit];
      // kitData is { active_record: {...}, records: [...] }
      if (!kitData) return false;
      // Check if there's an active_record with status active or paused
      const activeRecord = kitData.active_record;
      return activeRecord && (activeRecord.status === 'active' || activeRecord.status === 'paused');
    });
    
    if (activeKits.length > 0) {
      toast.error(`Please stop all active collections before ending shift. Active kits: ${activeKits.join(', ')}`);
      return;
    }
    
    // All collections stopped - open handover dialog
    openHandoverDialog(dep, 'outgoing', shiftType);
  };

  const updateKitChecklist = (kit, key, value) => {
    setKitChecklists(prev => ({
      ...prev,
      [kit]: { ...prev[kit], [key]: parseInt(value) || 0 }
    }));
  };

  const updateBnbChecklist = (key, value) => {
    setBnbChecklist(prev => ({ ...prev, [key]: parseInt(value) || 0 }));
  };

  const addMissingItem = () => {
    setMissingItems(prev => [...prev, { item: '', quantity: 1, kit_id: '', report_as_lost: false }]);
  };

  const updateMissingItem = (index, field, value) => {
    setMissingItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeMissingItem = (index) => {
    setMissingItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitHandover = async () => {
    try {
      const kitChecklistsArray = Object.entries(kitChecklists).map(([kit_id, values]) => ({
        kit_id,
        ...values
      }));
      
      await api.post('/handovers', {
        deployment_id: handoverDeployment.id,
        handover_type: handoverType,
        shift_type: handoverShiftType, // NEW: include which shift is doing handover
        kit_checklists: kitChecklistsArray,
        bnb_checklist: bnbChecklist,
        missing_items: missingItems.filter(m => m.item),
        notes: handoverNotes || null
      });
      
      toast.success(`${handoverShiftType === 'morning' ? 'Morning' : 'Night'} shift handover (${handoverType}) submitted successfully`);
      setHandoverDialogOpen(false);
      
      // Refresh handover status
      if (handoverDeployment) {
        fetchHandoverStatus(handoverDeployment.id, handoverDeployment.date);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit handover');
    }
  };

  // Admin deployment functions
  const openAddDialog = () => {
    if (!selectedDate) {
      toast.error('Please select a date first');
      return;
    }
    setEditingDeployment(null);
    setFormData({ bnb: '', morning_managers: [], evening_managers: [], assigned_kits: [] });
    setDialogOpen(true);
  };

  const openEditDialog = (deployment) => {
    setEditingDeployment(deployment);
    setFormData({
      bnb: deployment.bnb,
      morning_managers: deployment.morning_managers || [],
      evening_managers: deployment.evening_managers || [],
      assigned_kits: deployment.assigned_kits || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasManagers = (formData.morning_managers?.length > 0) || (formData.evening_managers?.length > 0);
    if (!formData.bnb || !hasManagers) {
      toast.error('BnB and at least one manager (morning or evening) required');
      return;
    }

    try {
      const payload = {
        date: formatDateKey(selectedDate),
        bnb: formData.bnb,
        morning_managers: formData.morning_managers,
        evening_managers: formData.evening_managers,
        assigned_kits: formData.assigned_kits,
      };

      if (editingDeployment) {
        await api.put(`/deployments/${editingDeployment.id}`, payload);
        toast.success('Deployment updated');
      } else {
        await api.post('/deployments', payload);
        toast.success('Deployment created');
      }
      
      setDialogOpen(false);
      fetchDeployments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    }
  };

  const handleDelete = async (deploymentId) => {
    if (!confirm('Delete this deployment?')) return;
    try {
      await api.delete(`/deployments/${deploymentId}`);
      toast.success('Deleted');
      setExpandedDeployment(null);
      fetchDeployments();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const toggleKit = (kitId) => {
    const arr = formData.assigned_kits;
    setFormData({
      ...formData,
      assigned_kits: arr.includes(kitId) ? arr.filter(k => k !== kitId) : [...arr, kitId]
    });
  };

  const toggleMorningManager = (managerId) => {
    const arr = formData.morning_managers || [];
    setFormData({
      ...formData,
      morning_managers: arr.includes(managerId) ? arr.filter(m => m !== managerId) : [...arr, managerId]
    });
  };

  const toggleEveningManager = (managerId) => {
    const arr = formData.evening_managers || [];
    setFormData({
      ...formData,
      evening_managers: arr.includes(managerId) ? arr.filter(m => m !== managerId) : [...arr, managerId]
    });
  };

  const getUserName = (userId) => managers.find(m => m.id === userId)?.name || userId;
  
  // Get kit status from the new data structure
  const getKitStatus = (kit) => {
    const kitData = kitShifts[kit];
    if (!kitData) return 'not_started';
    return kitData.active_record?.status || 'not_started';
  };
  
  // Get the active record for a kit
  const getActiveRecord = (kit) => kitShifts[kit]?.active_record || null;
  
  // Get all completed records for a kit
  const getCompletedRecords = (kit) => {
    const kitData = kitShifts[kit];
    if (!kitData) return [];
    return kitData.records?.filter(r => r.status === 'completed') || [];
  };
  
  // Get total hours for a kit (sum of all completed records)
  const getTotalKitHours = (kit) => {
    const completed = getCompletedRecords(kit);
    return completed.reduce((sum, r) => sum + (r.total_duration_hours || 0), 0);
  };
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-amber-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-slate-300';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Active';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      default: return 'Not Started';
    }
  };

  // Date is fully user-controlled - no "today" concept needed
  const days = currentMonth ? getDaysInMonth(currentMonth) : [];
  const monthName = currentMonth ? currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  const selectedDeployments = selectedDate ? getDeploymentsForDate(selectedDate) : [];
  const ssdItems = items.filter(i => i.category === 'ssd' || i.item_name.toLowerCase().includes('ssd'));

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Error State - Show if operational date fetch failed */}
      {dateError && (
        <div className="fixed inset-0 bg-slate-100 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center shadow-lg">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Connection Error</h2>
            <p className="text-slate-600 mb-6">{dateError}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-slate-900 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Page
            </Button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </a>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Deployments</h1>
              <p className="text-sm text-slate-600">
                {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Select a date'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* Calendar - Collapsible, compact when collapsed */}
        {calendarCollapsed && selectedDate ? (
          <div className="bg-white rounded-xl border px-4 py-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 text-white rounded-lg flex items-center justify-center font-bold">
                {selectedDate.getDate()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedDeployments.length} deployment{selectedDeployments.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCalendarCollapsed(false)} data-testid="expand-calendar-btn">
              <RefreshCw className="w-4 h-4 mr-2" />
              Change Date
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-semibold">{monthName}</h2>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} className="text-center text-xs font-medium text-slate-500 py-1">{day}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="aspect-square" />;
                const dateKey = formatDateKey(day);
                const dayDeployments = getDeploymentsForDate(day);
                const hasDeployments = dayDeployments.length > 0;
                
                return (
                  <button
                    key={dateKey}
                    onClick={() => selectDate(day)}
                    data-testid={`day-${dateKey}`}
                    className={`aspect-square p-1 rounded-lg border transition-all relative ${
                      hasDeployments 
                        ? 'bg-green-50 border-green-300 font-bold hover:bg-green-100'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-sm">{day.getDate()}</span>
                    {hasDeployments && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </div>
            
            <p className="text-xs text-center text-slate-500 mt-3">
              Tap a date to view deployments
            </p>
          </div>
        )}

        {/* Deployments for selected date */}
        {selectedDate && (
          <div className="space-y-3">
            {/* Header row for admin */}
            {isAdmin && (
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </h3>
                <Button size="sm" onClick={openAddDialog} data-testid="add-deployment-btn">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Deployment
                </Button>
              </div>
            )}

            {/* Deployment cards - NEW STRUCTURE: One card per BnB with morning+evening inside */}
            {selectedDeployments.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No deployments</p>
                <p className="text-sm text-slate-400 mt-1">
                  {isManager ? 'No assignments for this date' : 'Add a deployment to get started'}
                </p>
              </div>
            ) : (
              selectedDeployments.map((dep) => (
                <div 
                  key={dep.id} 
                  className={`bg-white rounded-xl border overflow-hidden transition-all ${
                    expandedDeployment === dep.id ? 'ring-2 ring-blue-400' : ''
                  }`}
                  data-testid={`deployment-${dep.id}`}
                >
                  {/* Entire header block is clickable to expand/collapse */}
                  <div
                    onClick={() => toggleDeploymentExpand(dep)}
                    className="cursor-pointer"
                    data-testid={`deployment-header-${dep.id}`}
                  >
                    {/* BnB Header - Dark bar */}
                    <div className="w-full bg-slate-900 text-white px-4 py-3 flex items-center justify-between hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-5 h-5" />
                        <span className="font-bold text-lg">{dep.bnb}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); openEditDialog(dep); }}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-red-500" onClick={(e) => { e.stopPropagation(); handleDelete(dep.id); }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {expandedDeployment === dep.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                    
                    {/* Morning + Evening Teams Section - Also clickable */}
                    <div className="px-4 py-3 border-b bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Morning Team */}
                        <div className="flex items-start gap-2">
                          <Sun className="w-4 h-4 text-amber-500 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-amber-700 uppercase">Morning Team</p>
                            <p className="text-sm text-slate-600">
                              {dep.morning_managers?.length > 0 
                                ? dep.morning_managers.map(id => managers.find(u => u.id === id)?.name || id).join(', ')
                                : <span className="text-slate-400 italic">Not assigned</span>
                              }
                            </p>
                          </div>
                        </div>
                        {/* Evening Team */}
                        <div className="flex items-start gap-2">
                          <Moon className="w-4 h-4 text-indigo-500 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-indigo-700 uppercase">Evening Team</p>
                            <p className="text-sm text-slate-600">
                              {dep.evening_managers?.length > 0 
                                ? dep.evening_managers.map(id => managers.find(u => u.id === id)?.name || id).join(', ')
                                : <span className="text-slate-400 italic">Not assigned</span>
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Kits count and View History */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                        <span className="text-xs text-slate-500">{dep.assigned_kits?.length || 0} kits assigned</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={(e) => { e.stopPropagation(); navigate(`/deployments/${dep.id}/day-view`); }}
                          data-testid={`view-history-${dep.id}`}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View History
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded: Shift Tabs + Kit Cards + Handover */}
                  {expandedDeployment === dep.id && (
                    <div className="p-4 space-y-4">
                      {/* Shift Tabs */}
                      <div className="flex border-b border-slate-200">
                        <button
                          className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                            getActiveTab(dep) === 'morning'
                              ? 'border-amber-500 text-amber-700 bg-amber-50'
                              : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}
                          onClick={() => setActiveShiftTab(prev => ({ ...prev, [dep.id]: 'morning' }))}
                          data-testid={`morning-tab-${dep.id}`}
                        >
                          <Sun className="w-4 h-4" />
                          Morning Shift
                          {getUserShiftAccess(dep).canMorning && (
                            <span className="ml-1 w-2 h-2 bg-green-500 rounded-full" title="You have access"></span>
                          )}
                        </button>
                        <button
                          className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                            getActiveTab(dep) === 'evening'
                              ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
                              : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}
                          onClick={() => setActiveShiftTab(prev => ({ ...prev, [dep.id]: 'evening' }))}
                          data-testid={`evening-tab-${dep.id}`}
                        >
                          <Moon className="w-4 h-4" />
                          Night Shift
                          {getUserShiftAccess(dep).canNight && (
                            <span className="ml-1 w-2 h-2 bg-green-500 rounded-full" title="You have access"></span>
                          )}
                        </button>
                      </div>
                      
                      {/* Access Status Banner - only show if user doesn't have access */}
                      {(() => {
                        const currentTab = getActiveTab(dep);
                        const access = getUserShiftAccess(dep);
                        
                        // Access warning only
                        if ((currentTab === 'morning' && !access.canMorning) || (currentTab === 'evening' && !access.canNight)) {
                          return (
                            <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 flex items-center gap-2 text-slate-600">
                              <AlertCircle className="w-5 h-5 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-sm">View Only</p>
                                <p className="text-xs">You are not assigned to this shift. Actions are disabled.</p>
                              </div>
                            </div>
                          );
                        }
                        
                        return null;
                      })()}
                      
                      {/* Shift Actions - End Shift triggers handover */}
                      {(isAdmin || isManager) && (() => {
                        const currentTab = getActiveTab(dep);
                        const access = getUserShiftAccess(dep);
                        const status = handoverStatus[dep.id];
                        const hasAccess = currentTab === 'morning' ? access.canMorning : access.canNight;
                        
                        if (!hasAccess) return null;
                        
                        const shiftCompleted = currentTab === 'morning' 
                          ? status?.morning_outgoing_complete 
                          : status?.night_outgoing_complete;
                        
                        return (
                          <div className="flex gap-2 mb-2">
                            {/* End Shift Button - checks active collections, then opens handover */}
                            <Button 
                              variant={shiftCompleted ? "outline" : "default"}
                              size="sm" 
                              className={`flex-1 ${
                                shiftCompleted 
                                  ? 'bg-green-50 border-green-300 text-green-700' 
                                  : currentTab === 'morning' 
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                                    : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                              }`}
                              onClick={() => handleEndShift(dep, currentTab === 'morning' ? 'morning' : 'evening')}
                              data-testid={`end-${currentTab}-shift-btn`}
                              disabled={shiftCompleted}
                            >
                              <ClipboardCheck className="w-4 h-4 mr-2" />
                              {shiftCompleted 
                                ? `✓ ${currentTab === 'morning' ? 'Morning' : 'Evening'} Shift Completed` 
                                : `End ${currentTab === 'morning' ? 'Morning' : 'Evening'} Shift`}
                            </Button>
                          </div>
                        );
                      })()}
                      
                      {/* Kit Cards */}
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          Assigned Kits - {getActiveTab(dep) === 'morning' ? 'Morning' : 'Night'} Shift
                        </p>
                        {(!dep.assigned_kits || dep.assigned_kits.length === 0) ? (
                          <p className="text-sm text-slate-400 py-4 text-center">No kits assigned to this deployment</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {dep.assigned_kits.map(kit => {
                              const currentTab = getActiveTab(dep);
                              const status = getKitStatus(kit);
                              const activeRecord = getActiveRecord(kit);
                              const completedRecords = getCompletedRecords(kit);
                              const totalHours = getTotalKitHours(kit);
                              
                              // Access control
                              const access = getUserShiftAccess(dep);
                              const hasAccess = currentTab === 'morning' ? access.canMorning : access.canNight;
                              
                              // EMERGENCY FIX: Remove ALL blocking conditions
                              // Allow ANY user to start collection - just log for debugging
                              const canStart = (() => {
                                console.log('[CAN_START_CHECK] EMERGENCY MODE', { 
                                  kit, 
                                  currentTab, 
                                  hasAccess, 
                                  access,
                                  status,
                                  deploymentId: dep.id 
                                });
                                // TEMPORARY: Always allow - remove blocking
                                return { allowed: true, reason: null };
                              })();
                              
                              return (
                                <div 
                                  key={kit} 
                                  className={`border-2 rounded-xl overflow-hidden ${
                                    status === 'active' ? 'border-green-400 bg-green-50' :
                                    status === 'paused' ? 'border-amber-400 bg-amber-50' :
                                    'border-slate-200 bg-white'
                                  } ${!hasAccess ? 'opacity-60' : ''}`}
                                  data-testid={`kit-card-${kit}`}
                                >
                                  {/* Kit Header */}
                                  <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <Package className="w-5 h-5 text-slate-600" />
                                      <span className="font-bold text-lg">{kit}</span>
                                      {totalHours > 0 && (
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                          Total: {formatDuration(totalHours)}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-xs px-3 py-1 rounded-full text-white font-medium ${getStatusColor(status)}`}>
                                      {getStatusLabel(status)}
                                    </span>
                                  </div>
                                  
                                  {/* Hardware Check Status - SHIFT-SPECIFIC */}
                                  {hardwareCheckStatus[kit] && (hardwareCheckStatus[kit].morning || hardwareCheckStatus[kit].evening || hardwareCheckStatus[kit].night) && (
                                    <div className="px-4 py-1 bg-teal-50 border-b border-teal-100 flex items-center gap-2 text-xs text-teal-700">
                                      <CheckCircle className="w-3 h-3" />
                                      Hardware check: 
                                      {hardwareCheckStatus[kit].morning && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Morning ✓</span>}
                                      {(hardwareCheckStatus[kit].evening || hardwareCheckStatus[kit].night) && <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Night ✓</span>}
                                    </div>
                                  )}
                                  
                                  {/* Timer for active/paused */}
                                  {(status === 'active' || status === 'paused') && activeRecord && (
                                    <div className="px-4 py-3 text-center">
                                      <p className={`text-3xl font-mono font-bold ${status === 'active' ? 'text-green-600' : 'text-amber-600'}`} data-testid={`timer-${kit}`}>
                                        {formatTime(elapsedTimes[kit])}
                                      </p>
                                      <p className="text-xs text-slate-500 mt-1">
                                        {activeRecord.activity_type} • {activeRecord.ssd_used}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Control Buttons - EMERGENCY: ALWAYS SHOW START BUTTON */}
                                  <div className="px-4 py-3 bg-white border-t border-slate-100">
                                    {/* EMERGENCY FIX: Show Start button regardless of status */}
                                    {(status === 'not_started' || status === 'completed') && (
                                      <div>
                                        <Button 
                                          className="w-full h-12 text-base bg-green-500 hover:bg-green-600"
                                          onClick={() => {
                                            console.log('[BUTTON_CLICK] Start Collection clicked', { 
                                              kit, 
                                              canStart, 
                                              currentTab,
                                              deploymentId: dep?.id,
                                              status,
                                              hasAccess,
                                              timestamp: new Date().toISOString()
                                            });
                                            // EMERGENCY: Always call openStartShift, no conditions
                                            openStartShift(dep, kit);
                                          }}
                                          data-testid={`start-${kit}`}
                                        >
                                          <Play className="w-5 h-5 mr-2" />
                                          {completedRecords.length > 0 ? 'Start New Collection' : 'Start Collection'}
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'active' && hasAccess && (
                                      <div className="flex gap-2">
                                        <Button 
                                          className="flex-1 bg-amber-500 hover:bg-amber-600 h-12"
                                          onClick={() => handlePauseShift(kit)}
                                          data-testid={`pause-${kit}`}
                                        >
                                          <Pause className="w-5 h-5 mr-1" />
                                          Pause
                                        </Button>
                                        <Button 
                                          className="flex-1 bg-red-500 hover:bg-red-600 h-12"
                                          onClick={() => handleStopShift(kit)}
                                          data-testid={`stop-${kit}`}
                                        >
                                          <Square className="w-5 h-5 mr-1" />
                                          Stop
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'active' && !hasAccess && (
                                      <p className="text-xs text-slate-500 text-center py-2">Active collection by another shift</p>
                                    )}
                                    {status === 'paused' && hasAccess && (
                                      <div className="flex gap-2">
                                        <Button 
                                          className="flex-1 bg-green-500 hover:bg-green-600 h-12"
                                          onClick={() => handleResumeShift(kit)}
                                          data-testid={`resume-${kit}`}
                                        >
                                          <Play className="w-5 h-5 mr-1" />
                                          Resume
                                        </Button>
                                        <Button 
                                          className="flex-1 bg-red-500 hover:bg-red-600 h-12"
                                          onClick={() => handleStopShift(kit)}
                                          data-testid={`stop-${kit}`}
                                        >
                                          <Square className="w-5 h-5 mr-1" />
                                          Stop
                                        </Button>
                                      </div>
                                    )}
                                    {status === 'paused' && !hasAccess && (
                                      <p className="text-xs text-slate-500 text-center py-2">Paused collection by another shift</p>
                                    )}
                                  </div>
                                  
                                  {/* Completed Records List */}
                                  {completedRecords.length > 0 && (
                                    <div className="border-t border-slate-200">
                                      <div className="px-4 py-2 bg-slate-50">
                                        <p className="text-xs font-medium text-slate-500 uppercase">Collection Records ({completedRecords.length})</p>
                                      </div>
                                      <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                                        {completedRecords.map((record, idx) => (
                                          <div key={record.id} className="px-4 py-2 flex items-center justify-between text-sm" data-testid={`record-${record.id}`}>
                                            <div>
                                              <p className="font-medium text-slate-700">
                                                {formatDuration(record.total_duration_hours)}
                                                <span className="text-slate-400 ml-2 text-xs">{record.activity_type}</span>
                                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${record.shift === 'morning' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                  {record.shift === 'morning' ? 'AM' : 'PM'}
                                                </span>
                                              </p>
                                              <p className="text-xs text-slate-400">{record.ssd_used}</p>
                                            </div>
                                            {hasAccess && (
                                              <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleDeleteRecord(record.id)}
                                                data-testid={`delete-record-${record.id}`}
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Start Shift Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>Start Collection - {selectedKit}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStartShift} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div>
                <Label>SSD *</Label>
                <Select value={shiftFormData.ssd_used} onValueChange={(v) => setShiftFormData({ ...shiftFormData, ssd_used: v })}>
                  <SelectTrigger className="mt-1" data-testid="ssd-select"><SelectValue placeholder="Select SSD" /></SelectTrigger>
                  <SelectContent>
                    {ssdItems.length > 0 
                      ? ssdItems.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)
                      : items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Activity Type *</Label>
                <Select value={shiftFormData.activity_type} onValueChange={(v) => setShiftFormData({ ...shiftFormData, activity_type: v })}>
                  <SelectTrigger className="mt-1" data-testid="activity-select"><SelectValue placeholder="Select activity" /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setShiftDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1 bg-green-500 hover:bg-green-600" disabled={shiftLoading} data-testid="start-shift-btn">
                {shiftLoading ? 'Starting...' : 'Start'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Handover Dialog */}
      <Dialog open={handoverDialogOpen} onOpenChange={setHandoverDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              {handoverShiftType === 'morning' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              {handoverShiftType === 'morning' ? 'Morning' : 'Night'} - {handoverType === 'outgoing' ? 'End Handover' : 'Receive'} - {handoverDeployment?.bnb}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Kit-level checklists - Compact */}
            {handoverDeployment?.assigned_kits?.map(kit => (
              <div key={kit} className="border rounded-lg p-3">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Package className="w-3 h-3" />
                  {kit}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {KIT_CHECKLIST_ITEMS.map(item => (
                    <div key={item.key}>
                      <Label className="text-xs">{item.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={kitChecklists[kit]?.[item.key] || 0}
                        onChange={(e) => updateKitChecklist(kit, item.key, e.target.value)}
                        className="mt-0.5 h-8 text-sm"
                        data-testid={`kit-${kit}-${item.key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* BnB-level checklist - Compact */}
            <div className="border rounded-lg p-3 bg-slate-50">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <MapPin className="w-3 h-3" />
                Shared BnB Items
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {BNB_CHECKLIST_ITEMS.map(item => (
                  <div key={item.key}>
                    <Label className="text-xs">{item.label}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={bnbChecklist[item.key] || 0}
                      onChange={(e) => updateBnbChecklist(item.key, e.target.value)}
                      className="mt-0.5 h-8 text-sm"
                      data-testid={`bnb-${item.key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Missing items - Compact */}
            <div className="border rounded-lg p-3 border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Missing Items
                </h4>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addMissingItem}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
              
              {missingItems.length === 0 ? (
                <p className="text-xs text-slate-500">No missing items</p>
              ) : (
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {missingItems.map((mi, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-white p-1.5 rounded border text-xs">
                      <Select value={mi.item} onValueChange={(v) => updateMissingItem(idx, 'item', v)}>
                        <SelectTrigger className="flex-1 h-7 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
                        <SelectContent>
                          {items.map(i => <SelectItem key={i.item_name} value={i.item_name}>{i.item_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={mi.quantity}
                        onChange={(e) => updateMissingItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-12 h-7 text-xs"
                        placeholder="Qty"
                      />
                      <Select value={mi.kit_id || 'bnb'} onValueChange={(v) => updateMissingItem(idx, 'kit_id', v === 'bnb' ? '' : v)}>
                        <SelectTrigger className="w-20 h-7 text-xs"><SelectValue placeholder="Kit" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bnb">BnB</SelectItem>
                          {handoverDeployment?.assigned_kits?.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={mi.report_as_lost}
                          onChange={(e) => updateMissingItem(idx, 'report_as_lost', e.target.checked)}
                        />
                        Lost
                      </label>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMissingItem(idx)}>
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Notes - Compact */}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="mt-1 h-16 text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => setHandoverDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmitHandover} className="flex-1" data-testid="submit-handover-btn">
              Submit Handover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin: Add/Edit Deployment Dialog - NEW STRUCTURE */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
            <DialogTitle>{editingDeployment ? 'Edit Deployment' : 'Add Deployment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div>
                <Label>BnB *</Label>
                <Select value={formData.bnb} onValueChange={(v) => setFormData({ ...formData, bnb: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select BnB" /></SelectTrigger>
                  <SelectContent>
                    {bnbs.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Morning Team */}
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Sun className="w-3 h-3 text-amber-500" />
                  Morning Team
                </Label>
                <div className="flex flex-wrap gap-1.5 mt-1 max-h-20 overflow-y-auto p-1 bg-slate-50 rounded">
                  {managers.map(m => (
                    <button key={`morning-${m.id}`} type="button" onClick={() => toggleMorningManager(m.id)}
                      className={`px-2 py-1 text-xs rounded border transition-all ${
                        formData.morning_managers?.includes(m.id) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >{m.name}</button>
                  ))}
                </div>
              </div>
              
              {/* Evening Team */}
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Moon className="w-3 h-3 text-indigo-500" />
                  Evening Team
                </Label>
                <div className="flex flex-wrap gap-1.5 mt-1 max-h-20 overflow-y-auto p-1 bg-slate-50 rounded">
                  {managers.map(m => (
                    <button key={`evening-${m.id}`} type="button" onClick={() => toggleEveningManager(m.id)}
                      className={`px-2 py-1 text-xs rounded border transition-all ${
                        formData.evening_managers?.includes(m.id) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >{m.name}</button>
                  ))}
                </div>
              </div>
              
              <div>
                <Label>Kits</Label>
                <div className="flex flex-wrap gap-1.5 mt-1 max-h-20 overflow-y-auto p-1 bg-slate-50 rounded">
                  {kits.map(k => (
                    <button key={k.kit_id} type="button" onClick={() => toggleKit(k.kit_id)}
                      className={`px-2 py-1 text-xs rounded border transition-all ${
                        formData.assigned_kits?.includes(k.kit_id) ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >{k.kit_id}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-4 py-3 border-t bg-slate-50 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">{editingDeployment ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hardware Check Dialog - SHIFT-SPECIFIC with sticky footer */}
      <Dialog open={hardwareCheckDialog} onOpenChange={setHardwareCheckDialog}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Cpu className="w-4 h-4 text-teal-500" />
              Hardware Check - {hardwareCheckKit}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                hardwareCheckShiftType === 'morning' 
                  ? 'bg-amber-100 text-amber-700' 
                  : 'bg-indigo-100 text-indigo-700'
              }`}>
                {hardwareCheckShiftType === 'morning' ? 'Morning Shift' : 'Night Shift'}
              </span>
            </DialogTitle>
          </DialogHeader>
          
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <p className="text-xs text-slate-500">
              Upload photos of equipment before starting {hardwareCheckShiftType === 'morning' ? 'morning' : 'night'} shift collection.
            </p>
            
            {/* Compact 3-column grid for image uploads */}
            <div className="grid grid-cols-3 gap-2">
              {/* Left Glove */}
              <div>
                <Label className="text-xs flex items-center gap-1 mb-1">
                  <Hand className="w-3 h-3" />
                  Left Glove
                </Label>
                {hardwareImages.leftGlove ? (
                  <div className="relative">
                    <img src={hardwareImages.leftGlove} alt="Left Glove" className="w-full h-20 object-cover rounded border" />
                    <button 
                      type="button"
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                      onClick={() => setHardwareImages(prev => ({ ...prev, leftGlove: '' }))}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="block w-full h-20 border-2 border-dashed rounded cursor-pointer hover:border-teal-400 flex items-center justify-center bg-slate-50">
                    <div className="text-center">
                      <Camera className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-400">Upload</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload('leftGlove', e)} />
                  </label>
                )}
              </div>
              
              {/* Right Glove */}
              <div>
                <Label className="text-xs flex items-center gap-1 mb-1">
                  <Hand className="w-3 h-3 transform scale-x-[-1]" />
                  Right Glove
                </Label>
                {hardwareImages.rightGlove ? (
                  <div className="relative">
                    <img src={hardwareImages.rightGlove} alt="Right Glove" className="w-full h-20 object-cover rounded border" />
                    <button 
                      type="button"
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                      onClick={() => setHardwareImages(prev => ({ ...prev, rightGlove: '' }))}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="block w-full h-20 border-2 border-dashed rounded cursor-pointer hover:border-teal-400 flex items-center justify-center bg-slate-50">
                    <div className="text-center">
                      <Camera className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-400">Upload</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload('rightGlove', e)} />
                  </label>
                )}
              </div>
              
              {/* Head Camera */}
              <div>
                <Label className="text-xs flex items-center gap-1 mb-1">
                  <Camera className="w-3 h-3" />
                  Head Cam
                </Label>
                {hardwareImages.headCamera ? (
                  <div className="relative">
                    <img src={hardwareImages.headCamera} alt="Head Camera" className="w-full h-20 object-cover rounded border" />
                    <button 
                      type="button"
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                      onClick={() => setHardwareImages(prev => ({ ...prev, headCamera: '' }))}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="block w-full h-20 border-2 border-dashed rounded cursor-pointer hover:border-teal-400 flex items-center justify-center bg-slate-50">
                    <div className="text-center">
                      <Camera className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-400">Upload</p>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload('headCamera', e)} />
                  </label>
                )}
              </div>
            </div>
            
            {/* Notes - compact */}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={hardwareNotes}
                onChange={(e) => setHardwareNotes(e.target.value)}
                placeholder="Any issues with equipment..."
                className="mt-1 text-sm h-16 resize-none"
              />
            </div>
          </div>
          
          {/* Sticky footer with buttons */}
          <div className="px-4 py-3 border-t bg-slate-50 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setHardwareCheckDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={submitHardwareCheck} 
              size="sm"
              className="flex-1 bg-teal-500 hover:bg-teal-600" 
              disabled={hardwareLoading}
              data-testid="submit-hardware-check"
            >
              {hardwareLoading ? 'Submitting...' : 'Submit & Start'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
