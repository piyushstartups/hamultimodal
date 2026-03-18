import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { format } from 'date-fns';
import { Clock, User, Package, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { toast } from 'sonner';

export default function Requests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [requestsRes, usersRes] = await Promise.all([
        api.get('/requests'),
        api.get('/users'),
      ]);
      setRequests(requestsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (requestId, status) => {
    try {
      await api.put(`/requests/${requestId}`, { status });
      toast.success(`Request ${status}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update request');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'fulfilled':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || userId;
  };

  const groupedRequests = {
    pending: requests.filter(r => r.status === 'pending'),
    approved: requests.filter(r => r.status === 'approved'),
    fulfilled: requests.filter(r => r.status === 'fulfilled'),
    rejected: requests.filter(r => r.status === 'rejected'),
  };

  const renderRequestCard = (request) => (
    <div
      key={request.id}
      data-testid={`request-${request.id}`}
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
    >
      <div className="flex items-start justify-between mb-3">
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border font-tactical ${getStatusColor(request.status)}`}>
          {request.status.toUpperCase()}
        </span>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock className="w-4 h-4" />
          <span className="font-data">{format(new Date(request.timestamp), 'MMM dd, HH:mm')}</span>
        </div>
      </div>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <User className="w-4 h-4" />
          <span>Requested by: <span className="font-medium text-slate-900">{getUserName(request.requested_by)}</span></span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Package className="w-4 h-4" />
          <span>Item: <span className="font-data font-medium text-slate-900">{request.item_id}</span></span>
        </div>
        <div className="text-slate-600">
          From Kit: <span className="font-data font-medium text-slate-900">{request.from_kit}</span>
        </div>
        <div className="text-slate-600">
          Quantity: <span className="font-data font-medium text-slate-900">{request.quantity}</span>
        </div>
        {request.notes && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-slate-600">{request.notes}</p>
          </div>
        )}
      </div>

      {request.status === 'pending' && (
        <div className="flex gap-2">
          <Button
            data-testid={`approve-request-${request.id}`}
            onClick={() => updateRequestStatus(request.id, 'approved')}
            className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
            variant="outline"
            size="sm"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button
            data-testid={`reject-request-${request.id}`}
            onClick={() => updateRequestStatus(request.id, 'rejected')}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
            variant="outline"
            size="sm"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        </div>
      )}

      {request.status === 'approved' && (
        <Button
          data-testid={`fulfill-request-${request.id}`}
          onClick={() => updateRequestStatus(request.id, 'fulfilled')}
          className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
          variant="outline"
          size="sm"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Mark as Fulfilled
        </Button>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-tactical text-slate-900">Requests Dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">Manage item transfer requests</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-slate-600">Loading requests...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Requests */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold font-tactical text-slate-900">
                Pending ({groupedRequests.pending.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedRequests.pending.length > 0 ? (
                groupedRequests.pending.map(renderRequestCard)
              ) : (
                <p className="text-slate-500 col-span-full">No pending requests</p>
              )}
            </div>
          </div>

          {/* Approved Requests */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold font-tactical text-slate-900">
                Approved ({groupedRequests.approved.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedRequests.approved.length > 0 ? (
                groupedRequests.approved.map(renderRequestCard)
              ) : (
                <p className="text-slate-500 col-span-full">No approved requests</p>
              )}
            </div>
          </div>

          {/* Fulfilled Requests */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold font-tactical text-slate-900">
                Fulfilled ({groupedRequests.fulfilled.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedRequests.fulfilled.length > 0 ? (
                groupedRequests.fulfilled.map(renderRequestCard)
              ) : (
                <p className="text-slate-500 col-span-full">No fulfilled requests</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}