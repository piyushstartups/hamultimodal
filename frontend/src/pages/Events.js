import { useState, useEffect } from 'react';
import api from '../lib/api';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Clock, User, Package, MapPin } from 'lucide-react';
import Layout from '../components/Layout';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', user: '', kit: '' });
  const [users, setUsers] = useState([]);
  const [kits, setKits] = useState([]);

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      const [eventsRes, usersRes, kitsRes] = await Promise.all([
        api.get('/events', { params: { event_type: filter.type || undefined, user_id: filter.user || undefined, kit_id: filter.kit || undefined } }),
        api.get('/users'),
        api.get('/kits'),
      ]);
      setEvents(eventsRes.data);
      setUsers(usersRes.data);
      setKits(kitsRes.data);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEventTypeColor = (type) => {
    switch (type) {
      case 'start_shift':
      case 'end_shift':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'activity':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'transfer':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'damage':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || userId;
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Events Log</h1>
        <p className="text-sm text-slate-600 mt-1">Complete history of all logged actions</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Event Type</label>
            <Select value={filter.type} onValueChange={(val) => setFilter({ ...filter, type: val })}>
              <SelectTrigger data-testid="filter-event-type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="start_shift">Start Shift</SelectItem>
                <SelectItem value="end_shift">End Shift</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">User</label>
            <Select value={filter.user} onValueChange={(val) => setFilter({ ...filter, user: val })}>
              <SelectTrigger data-testid="filter-user">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Kit</label>
            <Select value={filter.kit} onValueChange={(val) => setFilter({ ...filter, kit: val })}>
              <SelectTrigger data-testid="filter-kit">
                <SelectValue placeholder="All kits" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kits</SelectItem>
                {kits.map(kit => (
                  <SelectItem key={kit.kit_id} value={kit.kit_id}>{kit.kit_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading events...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <div
              key={event.id}
              data-testid={`event-${event.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border font-tactical ${getEventTypeColor(event.event_type)}`}>
                    {event.event_type.replace('_', ' ').toUpperCase()}
                  </span>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock className="w-4 h-4" />
                    <span className="font-data">{format(new Date(event.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="w-4 h-4" />
                  <span>User: <span className="font-medium text-slate-900">{getUserName(event.user_id)}</span></span>
                </div>
                {event.from_kit && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-4 h-4" />
                    <span>From: <span className="font-data font-medium text-slate-900">{event.from_kit}</span></span>
                  </div>
                )}
                {event.to_kit && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-4 h-4" />
                    <span>To: <span className="font-data font-medium text-slate-900">{event.to_kit}</span></span>
                  </div>
                )}
                {event.item_id && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Package className="w-4 h-4" />
                    <span>Item: <span className="font-data font-medium text-slate-900">{event.item_id}</span></span>
                  </div>
                )}
                {event.quantity > 1 && (
                  <div className="text-slate-600">
                    Quantity: <span className="font-data font-medium text-slate-900">{event.quantity}</span>
                  </div>
                )}
                {event.severity && (
                  <div className="text-slate-600">
                    Severity: <span className="font-medium text-red-600">{event.severity.toUpperCase()}</span>
                  </div>
                )}
              </div>

              {event.notes && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-sm text-slate-600">{event.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-600">No events found</p>
        </div>
      )}
    </Layout>
  );
}