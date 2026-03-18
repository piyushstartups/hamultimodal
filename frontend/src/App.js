import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "sonner";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import InventorySummary from "./pages/InventorySummary";
import Events from "./pages/Events";
import Requests from "./pages/Requests";
import Damage from "./pages/Damage";
import Notifications from "./pages/Notifications";
import MyBnB from "./pages/MyBnB";
import AdminPanel from "./pages/AdminPanel";
import Handover from "./pages/Handover";
import LostItemsReport from "./pages/LostItemsReport";
import SSDOffloadDashboard from "./pages/SSDOffloadDashboard";
import InventoryManagement from "./pages/InventoryManagement";
import DeploymentPlanning from "./pages/DeploymentPlanning";
import AdminAnalytics from "./pages/AdminAnalytics";
import Incidents from "./pages/Incidents";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute>
                  <Inventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory-summary"
              element={
                <ProtectedRoute>
                  <InventorySummary />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events"
              element={
                <ProtectedRoute>
                  <Events />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests"
              element={
                <ProtectedRoute>
                  <Requests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/damage"
              element={
                <ProtectedRoute>
                  <Damage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-bnb"
              element={
                <ProtectedRoute>
                  <MyBnB />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPanel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/handover"
              element={
                <ProtectedRoute>
                  <Handover />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/lost-items"
              element={
                <ProtectedRoute>
                  <LostItemsReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/ssd-offload"
              element={
                <ProtectedRoute>
                  <SSDOffloadDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory-management"
              element={
                <ProtectedRoute>
                  <InventoryManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deployment-planning"
              element={
                <ProtectedRoute>
                  <DeploymentPlanning />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <AdminAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/incidents"
              element={
                <ProtectedRoute>
                  <Incidents />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
