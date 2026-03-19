import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { 
  ArrowLeft, MapPin, Calendar, Users, Package, Clock, 
  HardDrive, AlertTriangle, ClipboardCheck, Activity
} from 'lucide-react';

export default function BnbDayView() {
  const { deploymentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('shifts');

  useEffect(() => {
    fetchData();
  }, [deploymentId]);

  const fetchData = async () => {
    try {
      const response = await api.get(`/deployments/${deploymentId}/day-view`);
      setData(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours) => {
    if (!hours) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  };

  const tabs = [
    { id: 'shifts', label: 'Shift Logs', icon: Clock },
    { id: 'people', label: 'People', icon: Users },
    { id: 'ssd', label: 'SSD Usage', icon: HardDrive },
    { id: 'events', label: 'Events', icon: AlertTriangle },
    { id: 'handover', label: 'Handovers', icon: ClipboardCheck },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500">Deployment not found</p>
      </div>
    );
  }

  const { deployment, people, shift_logs, ssd_usage, events, handovers } = data;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/20"
              onClick={() => navigate('/deployments')}
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <h1 className="text-xl font-bold">{deployment.bnb}</h1>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{deployment.shift}</span>
              </div>
              <p className="text-sm text-white/70 mt-1 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(deployment.date)}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Deployment Info Bar */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">Kits:</span>
            <span className="font-medium">{deployment.assigned_kits?.join(', ') || 'None'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">Managers:</span>
            <span className="font-medium">
              {deployment.deployment_managers?.map(m => m.name).join(', ') || 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Shift Logs Tab */}
        {activeTab === 'shifts' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Shift Logs</h2>
            {shift_logs.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No shifts recorded
              </div>
            ) : (
              <div className="bg-white rounded-xl border divide-y">
                {shift_logs.map((shift, idx) => (
                  <div key={idx} className="p-4" data-testid={`shift-log-${idx}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{shift.kit}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            shift.status === 'completed' ? 'bg-green-100 text-green-700' :
                            shift.status === 'active' ? 'bg-blue-100 text-blue-700' :
                            shift.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {shift.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{shift.user_name}</p>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                          <span>Activity: <strong>{shift.activity_type}</strong></span>
                          <span>SSD: <strong>{shift.ssd_used}</strong></span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          {formatDuration(shift.total_duration_hours)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* People Tab */}
        {activeTab === 'people' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">People Who Worked</h2>
            {people.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No users recorded
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {people.map((person, idx) => (
                  <div key={idx} className="bg-white rounded-xl border p-4" data-testid={`person-${idx}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{person.user_name}</p>
                        <p className="text-sm text-slate-500">
                          Worked on: {person.kits_worked?.join(', ') || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SSD Usage Tab */}
        {activeTab === 'ssd' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">SSD Usage</h2>
            {ssd_usage.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No SSDs used
              </div>
            ) : (
              <div className="bg-white rounded-xl border divide-y">
                {ssd_usage.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between" data-testid={`ssd-${idx}`}>
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-5 h-5 text-slate-400" />
                      <span className="font-medium text-slate-900">{item.ssd}</span>
                    </div>
                    <div className="flex gap-2">
                      {item.kits.map(kit => (
                        <span key={kit} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {kit}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Events</h2>
            {events.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No events recorded
              </div>
            ) : (
              <div className="bg-white rounded-xl border divide-y">
                {events.map((evt, idx) => (
                  <div key={idx} className="p-4" data-testid={`event-${idx}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        evt.event_type === 'damage' ? 'bg-red-100' :
                        evt.event_type === 'lost' ? 'bg-amber-100' :
                        'bg-blue-100'
                      }`}>
                        <Activity className={`w-4 h-4 ${
                          evt.event_type === 'damage' ? 'text-red-600' :
                          evt.event_type === 'lost' ? 'text-amber-600' :
                          'text-blue-600'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            evt.event_type === 'damage' ? 'bg-red-100 text-red-700' :
                            evt.event_type === 'lost' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {evt.event_type.toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-900">{evt.item}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {evt.from_location && `From: ${evt.from_location}`}
                          {evt.from_location && evt.to_location && ' → '}
                          {evt.to_location && `To: ${evt.to_location}`}
                        </p>
                        {evt.notes && <p className="text-sm text-slate-500 mt-1">{evt.notes}</p>}
                        <p className="text-xs text-slate-400 mt-2">
                          By {evt.user_name} at {formatTime(evt.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Handovers Tab */}
        {activeTab === 'handover' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Handovers</h2>
            {handovers.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-500">
                No handovers recorded
              </div>
            ) : (
              <div className="space-y-4">
                {handovers.map((handover, idx) => (
                  <div key={idx} className="bg-white rounded-xl border overflow-hidden" data-testid={`handover-${idx}`}>
                    <div className="bg-slate-50 px-4 py-3 border-b flex items-center justify-between">
                      <div>
                        <span className={`text-sm font-medium px-2 py-1 rounded ${
                          handover.handover_type === 'outgoing' 
                            ? 'bg-orange-100 text-orange-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {handover.handover_type === 'outgoing' ? 'End Shift' : 'Start Shift'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">By {handover.user_name}</p>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Kit Checklists */}
                      {handover.kit_checklists?.map((kit, kidx) => (
                        <div key={kidx} className="border rounded-lg p-3">
                          <p className="font-medium text-slate-900 mb-2">{kit.kit_id}</p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {Object.entries(kit).filter(([k]) => k !== 'kit_id').map(([key, val]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-slate-500">{key.replace(/_/g, ' ')}</span>
                                <span className="font-medium">{val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      {/* BnB Checklist */}
                      {handover.bnb_checklist && (
                        <div className="border rounded-lg p-3 bg-slate-50">
                          <p className="font-medium text-slate-900 mb-2">BnB Items</p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            {Object.entries(handover.bnb_checklist).map(([key, val]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-slate-500">{key.replace(/_/g, ' ')}</span>
                                <span className="font-medium">{val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Missing Items */}
                      {handover.missing_items?.length > 0 && (
                        <div className="border border-amber-200 rounded-lg p-3 bg-amber-50">
                          <p className="font-medium text-amber-800 mb-2">Missing Items</p>
                          {handover.missing_items.map((item, midx) => (
                            <p key={midx} className="text-sm text-amber-700">
                              {item.item} x{item.quantity} {item.report_as_lost && '(LOST)'}
                            </p>
                          ))}
                        </div>
                      )}
                      
                      {handover.notes && (
                        <p className="text-sm text-slate-600 italic">Notes: {handover.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
