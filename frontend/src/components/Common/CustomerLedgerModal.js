import React, { useState } from 'react';
import toast from 'react-hot-toast';
import API_URL from '../../apiConfig'; 
import { apiClient } from '../../utils/apiClient';
// ✅ IMPORT handleViewPDF HERE
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler';
import Modal from './Modal'; 

const CustomerLedgerModal = ({ 
    isOpen, 
    onClose, 
    customerId, 
    customerName, 
    type = 'customer',       // 'customer' or 'supplier'
    ledgerMode = 'financial' // 'financial' (Account Balance) or 'claims' (Warranty History)
}) => {
    // Financial ledger defaults to current month, claims defaults to full history.
    const date = new Date();
    const firstDay = ledgerMode === 'claims'
        ? '2000-01-01'
        : new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    const today = date.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(today);
    const [loading, setLoading] = useState(false);

    // Dynamic Title based on mode
    const title = ledgerMode === 'claims' 
        ? `Claim History: ${customerName}` 
        : `Account Ledger: ${customerName}`;

    // --- HELPER: Construct the PDF URL ---
    const getPdfUrl = () => {
         if (ledgerMode === 'claims') {
            // 🚀 THIS IS THE CORRECT ENDPOINT FOR CLAIMS
            return `${API_URL}/api/claims/ledger/pdf?entityId=${customerId}&type=${type}&startDate=${startDate}&endDate=${endDate}`;
        } else {
            // 💰 EXISTING ENDPOINT FOR ACCOUNTS
            return `${API_URL}/api/ledger/${customerId}/pdf?startDate=${startDate}&endDate=${endDate}`;
        }
    };

    // 1. PRINT (Triggers Browser Print Dialog via iframe)
    const handleGenerate = () => {
        if (!customerId) return toast.error("ID missing");
        const url = getPdfUrl();
        handlePrintPDF(url); // ✅ Uses Token
        onClose();
    };

    // 2. VIEW (Opens PDF in a New Tab SECURELY)
    const handleView = () => {
        if (!customerId) return toast.error("ID missing");
        const url = getPdfUrl();
        handleViewPDF(url); // ✅ Fixes "No Token" error
        onClose();
    };

    // 3. WHATSAPP (Sends PDF via API)
    const handleWhatsApp = async () => {
        if (!customerId) return toast.error("ID missing");
        setLoading(true);

        try {
            let endpoint = "";
            let payload = { startDate, endDate };

            if (ledgerMode === 'claims') {
                endpoint = '/api/claims/ledger/whatsapp';
                payload = { ...payload, entityId: customerId, type };
            } else {
                endpoint = `/api/ledger/${customerId}/whatsapp`;
            }

            await apiClient.post(endpoint, payload);
            toast.success("Statement sent via WhatsApp! 📲");
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Failed to send WhatsApp");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
            <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-600 mb-1">
                        Select date range for <strong>{ledgerMode === 'claims' ? 'Warranty Claims' : 'Account Statement'}</strong>.
                    </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold mb-1">From Date</label>
                        <input 
                            type="date" 
                            className="w-full p-2 border rounded" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold mb-1">To Date</label>
                        <input 
                            type="date" 
                            className="w-full p-2 border rounded" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)} 
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                    <button onClick={onClose} className="px-3 py-2 bg-gray-100 rounded text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors">
                        Cancel
                    </button>
                    
                    <button 
                        onClick={handleWhatsApp} 
                        disabled={loading}
                        className="px-3 py-2 bg-green-600 text-white rounded text-sm font-bold hover:bg-green-700 shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        {loading ? '...' : '📲 WhatsApp'}
                    </button>

                    {/* 🚀 VIEW BUTTON */}
                    <button 
                        onClick={handleView} 
                        className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 shadow-md flex items-center gap-2 transition-all"
                    >
                        <span>👁️</span> View
                    </button>

                    <button 
                        onClick={handleGenerate} 
                        className="px-3 py-2 bg-purple-600 text-white rounded text-sm font-bold hover:bg-purple-700 shadow-md flex items-center gap-2 transition-all"
                    >
                        <span>🖨️</span> Print
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CustomerLedgerModal;