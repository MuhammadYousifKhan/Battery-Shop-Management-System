import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import API_URL from '../../apiConfig'; // ✅ Imported API_URL
import Table from '../Common/Table';
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler';

const PaymentReminders = () => {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

    useEffect(() => {
        fetchReminders();
    }, []);

    const fetchReminders = async () => {
        try {
            const response = await apiClient.get('/api/bills/reminders');
            if (Array.isArray(response)) {
                setReminders(response);
            } else if (response && Array.isArray(response.data)) {
                setReminders(response.data);
            } else {
                setReminders([]);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to fetch reminders");
            setReminders([]);
        } finally {
            setLoading(false);
        }
    };

    const getBillId = (id) => id ? id.slice(-6).toUpperCase() : '-';

    // --- Action Handlers ---
    // ✅ FIX: Use API_URL directly instead of apiClient.defaults.baseURL
    const onViewClick = (billId) => {
        const url = `${API_URL}/api/bills/${billId}/pdf`;
        handleViewPDF(url);
    };

    const onPrintClick = (billId) => {
        const url = `${API_URL}/api/bills/${billId}/pdf`;
        handlePrintPDF(url);
    };

    const handleSendWhatsApp = async (bill) => {
        if (!window.confirm(`Send invoice #${getBillId(bill._id)} to ${bill.customerName} via WhatsApp?`)) return;

        setSendingWhatsApp(bill._id);
        const toastId = toast.loading("Sending WhatsApp...");

        try {
            await apiClient.post(`/api/bills/${bill._id}/send-whatsapp`);
            toast.success("Sent successfully!", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(error.message || "Failed to send message", { id: toastId });
        } finally {
            setSendingWhatsApp(null);
        }
    };

    // Columns configuration (Used by your Table component)
    const columns = [
        'ID', 'Customer', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'
    ];

    const totalPending = (reminders || []).reduce((acc, r) => acc + (r.balance || 0), 0);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* CSS to force the table to fit within the box */}
            <style>{`
                table { table-layout: fixed; width: 100%; }
                /* Optional: Specific widths to optimize space */
                th:nth-child(1) { width: 8%; }  /* ID */
                th:nth-child(2) { width: 22%; } /* Customer */
                th:nth-child(8) { width: 18%; } /* Actions */
            `}</style>

            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Payment Reminders</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage overdue invoices and pending balances</p>
                </div>
                
                {/* Total Pending Card */}
                <div className="bg-white px-6 py-3 rounded-xl shadow-sm border border-red-100 flex items-center gap-4">
                    <div className="p-2 bg-red-50 rounded-full text-red-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Pending</p>
                        <p className="text-2xl font-black text-gray-800">Rs {totalPending.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <Table columns={columns} loading={loading}>
                    {reminders.map((bill) => (
                        <tr key={bill._id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors">
                            
                            {/* Bill ID */}
                            <td className="px-4 py-4">
                                <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                    #{getBillId(bill._id)}
                                </span>
                            </td>

                            {/* Customer Name - Truncated to prevent scroll */}
                            <td className="px-4 py-4">
                                <div className="font-bold text-gray-800 text-sm truncate max-w-[140px] xl:max-w-[200px]" title={bill.customerName}>
                                    {bill.customerName}
                                </div>
                                <div className="text-xs text-gray-400">{new Date(bill.createdAt).toLocaleDateString()}</div>
                            </td>

                            {/* Due Date & Overdue Days */}
                            <td className="px-4 py-4">
                                {bill.dueDate ? (
                                    <div>
                                        <div className={`text-sm font-medium ${bill.isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                                            {new Date(bill.dueDate).toLocaleDateString()}
                                        </div>
                                        {bill.isOverdue && (
                                            <span className="text-[10px] font-bold text-red-500">
                                                {Math.abs(bill.daysOverdue)} Days Late
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-gray-400 text-xs italic">--</span>
                                )}
                            </td>

                            {/* Financials */}
                            <td className="px-4 py-4 text-sm font-medium text-gray-600">
                                {bill.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-4 text-sm font-medium text-green-600">
                                {bill.paidAmount.toLocaleString()}
                            </td>
                            <td className="px-4 py-4 text-sm font-bold text-red-600">
                                {bill.balance.toLocaleString()}
                            </td>

                            {/* Status Badge */}
                            <td className="px-4 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                    ${bill.status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                    {bill.status}
                                </span>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                    {/* View Button */}
                                    <button 
                                        onClick={() => onViewClick(bill._id)} 
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="View PDF"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                    </button>

                                    {/* Print Button */}
                                    <button 
                                        onClick={() => onPrintClick(bill._id)} 
                                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                        title="Print Invoice"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                    </button>

                                    {/* WhatsApp Button (Primary) */}
                                    <button 
                                        onClick={() => handleSendWhatsApp(bill)} 
                                        disabled={sendingWhatsApp === bill._id}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm
                                            ${sendingWhatsApp === bill._id 
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                : 'bg-green-600 hover:bg-green-700 text-white shadow-green-200'
                                            }`}
                                        title="Send via WhatsApp"
                                    >
                                        {sendingWhatsApp === bill._id ? (
                                            <span className="animate-pulse">Sending...</span>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                                Send
                                            </>
                                        )}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
                
                {/* Empty State */}
                {!loading && reminders.length === 0 && (
                    <div className="py-16 text-center">
                        <div className="bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                            <span className="text-2xl">🎉</span>
                        </div>
                        <h3 className="text-gray-800 font-medium">All Caught Up!</h3>
                        <p className="text-gray-500 text-sm mt-1">No pending payments found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentReminders;