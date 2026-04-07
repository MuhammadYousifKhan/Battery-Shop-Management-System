import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Modal from '../Common/Modal';
import { useStoreSettings } from '../../context/StoreSettingsContext';

const AdminSettings = () => {
  const { settings, refreshSettings } = useStoreSettings();
  // Get ID from local storage
  const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
  const userId = userInfo._id;

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    securityQuestion: '',
    securityAnswer: ''
  });

  const [storeForm, setStoreForm] = useState({
    storeName: '',
    systemName: '',
    address: '',
    phone: '',
    watermarkName: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // --- Password Visibility States ---
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetNotes, setResetNotes] = useState('');

  // 1. Fetch User Data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiClient.get(`/api/users/${userId}`);
        setFormData((prev) => ({
          ...prev,
          username: data.username || '',
          securityQuestion: data.securityQuestion || '', // Load existing question if set
          // Keep password/answer blank for security
        }));

        const settingsRes = await apiClient.get('/api/settings');
        const settingsData = settingsRes?.data || settings;
        setStoreForm({
          storeName: settingsData.storeName || '',
          systemName: settingsData.systemName || '',
          address: settingsData.address || '',
          phone: settingsData.phone || '',
          watermarkName: settingsData.watermarkName || ''
        });
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load profile data.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStoreChange = (e) => {
    setStoreForm({ ...storeForm, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    if (formData.securityAnswer && !formData.securityQuestion) {
        toast.error("Please write a Security Question for your answer.");
        return;
    }

    setSaving(true);
    try {
      // Only send fields that exist
      const payload = {
        username: formData.username,
        securityQuestion: formData.securityQuestion
      };

      if (formData.password) payload.password = formData.password;
      if (formData.securityAnswer) payload.securityAnswer = formData.securityAnswer;

      await Promise.all([
        apiClient.put(`/api/users/${userId}`, payload),
        apiClient.put('/api/settings', {
          storeName: storeForm.storeName,
          systemName: storeForm.systemName,
          address: storeForm.address,
          phone: storeForm.phone,
          watermarkName: storeForm.watermarkName
        })
      ]);
      await refreshSettings();
      
      toast.success("Profile Updated Successfully!");
      
      // Clear sensitive fields
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '', securityAnswer: '' }));

    } catch (error) {
      toast.error(error.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDashboard = async () => {
    if (!window.confirm("Are you sure? This will Archive current profits, reset counters to 0, and DOWNLOAD a Report.")) return;
    const toastId = toast.loading("Closing Period & Generating Report...");
    try {
      const blob = await apiClient.post('/api/dashboard/reset', { notes: resetNotes }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Closing_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success("Period Closed & Report Downloaded!", { id: toastId });
      setIsResetModalOpen(false);
      setResetNotes('');
    } catch (error) {
      console.error(error);
      toast.error("Reset failed.", { id: toastId });
    }
  };

  if (loading) return (
      <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
  );

  return (
    <div className="p-6 md:p-10 bg-gray-50 min-h-full">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage store details, account credentials, and security options.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* --- Section 1: Store Details --- */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Store Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Store Name</label>
                <input
                  type="text"
                  name="storeName"
                  value={storeForm.storeName}
                  onChange={handleStoreChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter store name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">System Name</label>
                <input
                  type="text"
                  name="systemName"
                  value={storeForm.systemName}
                  onChange={handleStoreChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. My Store Management System"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Address</label>
                <input
                  type="text"
                  name="address"
                  value={storeForm.address}
                  onChange={handleStoreChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter address"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={storeForm.phone}
                  onChange={handleStoreChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0312-3456789"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">Watermark Name (PDF)</label>
                <input
                  type="text"
                  name="watermarkName"
                  value={storeForm.watermarkName}
                  onChange={handleStoreChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave empty to use store name"
                />
              </div>
            </div>
          </div>
          
          {/* --- Section 2: Identity --- */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Profile Information</h3>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Username</label>
                <input 
                  type="text" 
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50 focus:bg-white"
                  placeholder="Enter your username"
                  required
                />
            </div>
          </div>

          {/* --- Section 3: Security Question (Custom) --- */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Account Recovery</h3>
            <div className="bg-blue-50 p-5 rounded-lg border border-blue-100 space-y-4">
                 <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">Write Your Own Security Question</label>
                    <input
                        type="text" 
                        name="securityQuestion"
                        value={formData.securityQuestion}
                        onChange={handleChange}
                        placeholder="e.g. What is the name of my favorite childhood teacher?"
                        className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-blue-600 mt-1">This question will be asked if you forget your password.</p>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">Answer</label>
                    <input 
                        type="text" 
                        name="securityAnswer"
                        value={formData.securityAnswer}
                        onChange={handleChange}
                        placeholder="Type your secret answer here..."
                        className="w-full px-4 py-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                 </div>
            </div>
          </div>

          {/* --- Section 4: Change Password --- */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Change Password</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* New Password Field */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">New Password</label>
                <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Leave empty to keep current"
                      className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 focus:outline-none"
                    >
                        {showPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                    </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Confirm New Password</label>
                <div className="relative">
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm new password"
                      className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-600 focus:outline-none"
                    >
                        {showConfirmPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                    </button>
                </div>
              </div>
            </div>
          </div>

          {/* --- Footer Actions --- */}
          <div className="pt-4 flex justify-end items-center gap-3 flex-wrap border-t border-gray-100">
            <button 
              type="submit" 
              disabled={saving}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                </>
              ) : 'Save Changes'}
            </button>
          </div>

        </form>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-red-100 overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b border-red-100">
            <h3 className="text-lg font-bold text-red-800">Financial Period Controls</h3>
            <p className="text-sm text-red-700 mt-1">
              These actions are operational controls and are intentionally kept separate from profile and store settings.
            </p>
          </div>
          <div className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-800">End Financial Period</p>
              <p className="text-sm text-gray-600 mt-1">
                Archive period totals, reset counters, and generate a closing report.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 transition-all shadow-md w-full md:w-auto"
            >
              End Financial Period
            </button>
          </div>
        </div>

        <Modal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} title="End Financial Period">
          <div className="space-y-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Warning: Permanent Action</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>You are about to close the current financial period.</p>
                    <ul className="list-disc list-inside mt-1">
                      <li>Current Profits & Sales counters will reset to <strong>0</strong>.</li>
                      <li>A "Closing Report" (PDF) will be downloaded.</li>
                      <li>Customer Balances & Stock Levels will <strong>NOT</strong> change.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Closing Notes (Optional)</label>
              <textarea
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="3"
                placeholder="e.g., Closing Fiscal Year 2024..."
                value={resetNotes}
                onChange={(e) => setResetNotes(e.target.value)}
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setIsResetModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleResetDashboard} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold shadow hover:bg-red-700">Confirm Reset</button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default AdminSettings;


// there were changes by usman