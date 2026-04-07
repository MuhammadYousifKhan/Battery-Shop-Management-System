import React, { useEffect, useState } from 'react';
import { Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Header from './components/Common/Header';
import Sidebar from './components/Common/Sidebar';
import Footer from './components/Common/Footer';
import Modal from './components/Common/Modal';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword'; 
import PrivateRoute from './components/Common/PrivateRoute';

// Admin components
import AdminDashboard from './components/Admin/Dashboard';
import InventoryManagement from './components/Admin/InventoryManagement';
import InvoiceSystem from './components/Admin/InvoiceSystem';
import ManagerControl from './components/Admin/ManagerControl';
import SalesReports from './components/Admin/SalesReports';
import SupplierManagement from './components/Admin/SupplierManagement'; 
import AdminSettings from './components/Admin/AdminSettings'; 

// Manager components
import ManagerDashboard from './components/Manager/Dashboard';
import OrderManagement from './components/Manager/OrderManagement';
import CustomerManagement from './components/Manager/CustomerManagement'
import Billing from './components/Manager/Billing';
import PaymentReminders from './components/Manager/PaymentReminders'; // 👈 IMPORT
import StockCheck from './components/Manager/StockCheck';
import ScrapBatteries from './components/Manager/ScrapBatteries';
import ClaimManagement from './components/Manager/ClaimManagement'; 
import CustomerAccounts from './components/Manager/CustomerAccounts'; 

import { ROLES } from './Constants'; 
import { StoreSettingsProvider } from './context/StoreSettingsContext';

const ProtectedLayout = ({ role }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Check if current path is a dashboard to optionally hide footer
  const isDashboard = location.pathname.includes('/dashboard');

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar role={role} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4 md:p-6 flex flex-col">
          <div className="flex-grow">
            <Outlet />
          </div>
          {/* Only show Footer if NOT on Dashboard */}
          {!isDashboard && <Footer />}
        </main>
      </div>
    </div>
  );
};

const Unauthorized = () => (
    <div className="flex justify-center items-center h-screen px-4">
        <div className="text-center p-6 md:p-10 bg-white rounded-lg shadow-xl w-full max-w-md">
            <h1 className="text-3xl md:text-4xl font-bold text-red-600 mb-4">Unauthorized</h1>
            <button onClick={() => window.location.href = '/login'} className="mt-6 bg-blue-600 text-white px-5 py-2 rounded-lg w-full md:w-auto">
                Go to Login
            </button>
        </div>
    </div>
);

function App() {
  const [pdfPreview, setPdfPreview] = useState({ isOpen: false, title: 'PDF Preview', url: '' });

  useEffect(() => {
    const onOpenPdfDialog = (event) => {
      const { pdfUrl, title } = event.detail || {};
      if (!pdfUrl) return;

      window.dispatchEvent(new CustomEvent('app:pdf-dialog-opened'));

      setPdfPreview((prev) => {
        if (prev.url) {
          window.URL.revokeObjectURL(prev.url);
        }
        return {
          isOpen: true,
          title: title || 'PDF Preview',
          url: pdfUrl
        };
      });
    };

    window.addEventListener('app:open-pdf-dialog', onOpenPdfDialog);
    return () => {
      window.removeEventListener('app:open-pdf-dialog', onOpenPdfDialog);
      setPdfPreview((prev) => {
        if (prev.url) {
          window.URL.revokeObjectURL(prev.url);
        }
        return { isOpen: false, title: 'PDF Preview', url: '' };
      });
    };
  }, []);

  const closePdfPreview = () => {
    setPdfPreview((prev) => {
      if (prev.url) {
        window.URL.revokeObjectURL(prev.url);
      }
      return { isOpen: false, title: 'PDF Preview', url: '' };
    });
  };

  return (
    <StoreSettingsProvider>
      <Toaster position="top-center" reverseOrder={false} />

      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/forgot-password" element={<ForgotPassword />} />
        
        <Route path="/unauthorized" element={<Unauthorized />} /> 

        {/* --- Admin Routes --- */}
        <Route element={<PrivateRoute roles={[ROLES.ADMIN]} />}> 
            <Route path="/admin" element={<ProtectedLayout role={ROLES.ADMIN} />}> 
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="inventory" element={<InventoryManagement />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="customers" element={<CustomerManagement />} /> 
                <Route path="orders" element={<OrderManagement />} />
                <Route path="billing" element={<Billing />} />
                <Route path="reminders" element={<PaymentReminders />} /> {/* 👈 NEW ROUTE */}
                <Route path="stock" element={<StockCheck />} />
                <Route path="suppliers" element={<SupplierManagement />} /> 
                <Route path="invoices" element={<InvoiceSystem />} />
                <Route path="managers" element={<ManagerControl />} />
                <Route path="reports" element={<SalesReports />} />
                <Route path="accounts" element={<CustomerAccounts />} /> 
                <Route path="scrap" element={<ScrapBatteries />} />
                <Route path="claims" element={<ClaimManagement />} />
            </Route>
        </Route>
        
        {/* --- Manager Routes --- */}
        <Route element={<PrivateRoute roles={[ROLES.MANAGER]} />}> 
             <Route path="/manager" element={<ProtectedLayout role={ROLES.MANAGER} />}> 
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<ManagerDashboard />} />
                <Route path="orders" element={<OrderManagement />} />
                <Route path="customers" element={<CustomerManagement />} />
                <Route path="accounts" element={<CustomerAccounts />} /> 
                <Route path="billing" element={<Billing />} />
                <Route path="reminders" element={<PaymentReminders />} /> {/* 👈 NEW ROUTE */}
              <Route path="suppliers" element={<SupplierManagement />} />
              <Route path="invoices" element={<InvoiceSystem />} />
                <Route path="stock" element={<StockCheck />} />
                <Route path="scrap" element={<ScrapBatteries />} />
                <Route path="claims" element={<ClaimManagement />} />
            </Route>
        </Route>

        <Route path="/" element={<NavigateToDashboardOrLogin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Modal isOpen={pdfPreview.isOpen} onClose={closePdfPreview} title={pdfPreview.title} maxWidth="max-w-6xl">
        <div className="w-full h-[78vh] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
          {pdfPreview.url ? (
            <iframe
              title={pdfPreview.title}
              src={pdfPreview.url}
              className="w-full h-full"
            />
          ) : null}
        </div>
      </Modal>
    </StoreSettingsProvider>
  );
}

const NavigateToDashboardOrLogin = () => {
    const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
    const userRole = localStorage.getItem("userRole");
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (userRole === ROLES.ADMIN) return <Navigate to="/admin/dashboard" replace />;
    if (userRole === ROLES.MANAGER) return <Navigate to="/manager/dashboard" replace />;
    return <Navigate to="/login" replace />;
};

export default App;