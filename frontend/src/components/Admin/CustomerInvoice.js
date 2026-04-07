import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import API_URL from '../../apiConfig'; 
import Table from '../Common/Table';
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler'; 

const CustomerInvoice = () => {
    const [invoices, setInvoices] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [customers, setCustomers] = useState([]);
    
    // Selection States
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerData, setCustomerData] = useState(null);
    const [invoiceItems, setInvoiceItems] = useState([]);
    
    // Financial States
    const [previousBalance, setPreviousBalance] = useState(0);
    const [subtotal, setSubtotal] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    
    const [loading, setLoading] = useState(false);
    const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

    // Search States
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');

    const fetchInvoices = useCallback(async () => {
        setListLoading(true);
        try {
            const data = await apiClient.get('/api/customer-invoices');
            setInvoices(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
        } catch (err) { toast.error(err.message); } finally { setListLoading(false); }
    }, []); 

    const fetchCustomers = useCallback(async () => {
        setLoading(true); 
        try {
            const data = await apiClient.get('/api/customers?type=wholesale');
            setCustomers(data);
        } catch (err) { toast.error(err.message); } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchCustomers();
        fetchInvoices();
    }, [fetchInvoices, fetchCustomers]);

    const handleCustomerSelect = async (customerId) => {
        if (!customerId) { setSelectedCustomerId(''); setCustomerData(null); setInvoiceItems([]); return; }
        setLoading(true); 
        setSelectedCustomerId(customerId); 
        setInvoiceItems([]);
        try {
            const data = await apiClient.get(`/api/customer-invoices/unbilled/${customerId}`);
            setCustomerData(data);
            const balance = data.customer.currentBalance || 0;
            setPreviousBalance(balance); setTotalAmount(balance);
        } catch (err) { toast.error(err.message); } finally { setLoading(false); }
    };

    const handleItemToggle = (bill) => {
        const itemsFromBill = bill.items.map(item => ({
            productName: item.productName, // Contains SKU if saved correctly
            sku: item.sku,                 // Explicit SKU if available
            quantity: item.quantity, 
            price: item.price, 
            total: item.quantity * item.price, 
            billRef: bill._id
        }));
        let newInvoiceItems = [...invoiceItems];
        if (invoiceItems.some(item => item.billRef === bill._id)) {
            newInvoiceItems = invoiceItems.filter(item => item.billRef !== bill._id);
        } else { newInvoiceItems.push(...itemsFromBill); }

        const newSubtotal = newInvoiceItems.reduce((acc, item) => acc + item.total, 0);
        setInvoiceItems(newInvoiceItems); setSubtotal(newSubtotal); setTotalAmount(previousBalance + newSubtotal);
    };
    
    const isBillSelected = (billId) => invoiceItems.some(item => item.billRef === billId);

    const handleSubmitInvoice = async () => {
        if (invoiceItems.length === 0) { toast.error("Please select at least one bill item."); return; }
        setLoading(true); const toastId = toast.loading("Generating Invoice...");
        try {
            const payload = { customerId: selectedCustomerId, items: invoiceItems, previousBalance, subtotal, totalAmount, status: 'sent' };
            const createdInvoice = await apiClient.post('/api/customer-invoices', payload);
            toast.success(`Invoice ${createdInvoice.invoiceNumber} created!`, { id: toastId });
            handleCustomerSelect(selectedCustomerId); fetchInvoices(); 
        } catch (err) { toast.error(err.message, { id: toastId }); } finally { setLoading(false); }
    };
    
    const handleSendWhatsApp = async (invoiceId, invoiceNumber) => {
        if (!window.confirm(`Re-send invoice ${invoiceNumber} via WhatsApp?`)) { return; }
        setSendingWhatsApp(invoiceId); const toastId = toast.loading("Sending...");
        try { await apiClient.post(`/api/customer-invoices/${invoiceId}/send-whatsapp`); toast.success("Invoice sent!", { id: toastId }); } 
        catch (err) { toast.error(err.message, { id: toastId }); } finally { setSendingWhatsApp(null); }
    };

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

    // --- FILTER LOGIC ---
    const filteredInvoices = invoices.filter(inv => {
        const search = invoiceSearch.toLowerCase();
        return (
            inv.customerName.toLowerCase().includes(search) ||
            inv.invoiceNumber.toLowerCase().includes(search) ||
            formatDate(inv.date).includes(search)
        );
    });

    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(customerSearch)) ||
        (c.shopName && c.shopName.toLowerCase().includes(customerSearch.toLowerCase()))
    );

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Customer Invoices</h1>

            {/* ========================================================= */}
            {/* 1. CREATE INVOICE SECTION                                 */}
            {/* ========================================================= */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-8 border-t-4 border-blue-600">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Create New Customer Invoice</h2>
                    {/* Add Customer Button Removed */}
                </div>
                
                {/* Searchable Customer List */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Wholesale Customer</label>
                    <input 
                        type="text"
                        placeholder="Search Customer by Name, Phone or Shop Name..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full p-3 border rounded-lg bg-gray-50 mb-2 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    
                    {/* Customer Results List */}
                    <div className="border rounded-lg max-h-48 overflow-y-auto bg-white shadow-inner">
                        {loading && customers.length === 0 ? (
                             <p className="p-3 text-gray-500">Loading customers...</p>
                        ) : filteredCustomers.length === 0 ? (
                            <p className="p-3 text-gray-500 text-center">No customers found.</p>
                        ) : (
                            filteredCustomers.map(c => (
                                <div 
                                    key={c._id} 
                                    onClick={() => handleCustomerSelect(c._id)}
                                    className={`
                                        p-3 cursor-pointer border-b last:border-0 hover:bg-blue-50 transition-colors flex justify-between items-center group
                                        ${selectedCustomerId === c._id ? 'bg-blue-100 border-l-4 border-blue-600' : ''}
                                    `}
                                >
                                    <div>
                                        <div className="font-semibold text-gray-800">{c.name}</div>
                                        <div className="text-xs text-gray-500">{c.shopName || c.phone}</div>
                                    </div>
                                    {/* Balance and Edit Button Removed */}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {loading && selectedCustomerId && <p className="text-blue-600 animate-pulse">Loading unbilled items...</p>}
                
                {customerData && !loading && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="lg:col-span-2">
                            <h3 className="text-lg font-semibold mb-2">Unbilled Items</h3>
                            <div className="overflow-x-auto border rounded-lg max-h-80">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold text-gray-600">Select</th>
                                            <th className="px-4 py-3 text-left font-bold text-gray-600">Bill ID</th>
                                            <th className="px-4 py-3 text-left font-bold text-gray-600">SKU / Item</th>
                                            <th className="px-4 py-3 text-left font-bold text-gray-600">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {customerData.unbilledBills.length === 0 ? (<tr><td colSpan="4" className="text-center py-8 text-gray-500">No unbilled items found for this customer.</td></tr>) : (
                                            customerData.unbilledBills.map(bill => (
                                                <tr key={bill._id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-4"><input type="checkbox" checked={isBillSelected(bill._id)} onChange={() => handleItemToggle(bill)} className="h-5 w-5 text-blue-600 cursor-pointer"/></td>
                                                    <td className="px-4 py-4 text-sm whitespace-nowrap font-mono text-gray-500">{bill._id.slice(-6).toUpperCase()}</td>
                                                    <td className="px-4 py-4 text-sm">
                                                        {bill.items.map((item, index) => (
                                                            <div key={index} className="mb-1">
                                                                <span className="font-bold font-mono text-gray-700">{item.sku || item.productName}</span> 
                                                                <span className="text-gray-500 text-xs ml-1">({item.quantity})</span>
                                                            </div>
                                                        ))}
                                                    </td>
                                                    <td className="px-4 py-4 text-sm whitespace-nowrap font-medium">Rs {bill.amount}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-5 rounded-lg shadow-sm border border-gray-200 h-fit">
                            <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Invoice Summary</h3>
                            <div className="space-y-3 text-sm md:text-base">
                                <div className="flex justify-between text-gray-600"><span>Prev Balance:</span><span className="font-medium">Rs {previousBalance.toFixed(2)}</span></div>
                                <div className="flex justify-between text-gray-600"><span>New Items:</span><span className="font-medium">Rs {subtotal.toFixed(2)}</span></div>
                                <hr className="border-gray-300 my-2"/>
                                <div className="flex justify-between text-xl font-bold text-gray-900"><span>Total Due:</span><span>Rs {totalAmount.toFixed(2)}</span></div>
                            </div>
                            <button onClick={handleSubmitInvoice} disabled={loading || invoiceItems.length === 0} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 mt-6 disabled:opacity-50 transition shadow-md">{loading ? "Generating..." : "Generate & Send Invoice"}</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* 2. INVOICE HISTORY SECTION                                */}
            {/* ========================================================= */}
            <div className="bg-white p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Invoice History</h2>
                <div className="mb-4">
                    <input 
                        type="text"
                        placeholder="Search History by Name, Code (Invoice #) or Date..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        className="w-full md:w-1/2 p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="max-h-[600px] overflow-y-auto border rounded-lg">
                    <Table columns={['Date', 'Invoice #', 'Customer', 'Amount', 'Status', 'Actions']} loading={listLoading}>
                        {filteredInvoices.map(inv => (
                            <tr key={inv._id}>
                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(inv.date)}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{inv.invoiceNumber}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{inv.customerName}</td>
                                <td className="px-4 py-3 whitespace-nowrap">Rs {inv.totalAmount.toFixed(2)}</td>
                                <td className="px-4 py-3 whitespace-nowrap">{inv.status}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => handlePrintPDF(`${API_URL}/api/customer-invoices/${inv._id}/pdf`)} className="text-gray-600 hover:text-gray-900 border px-2 py-1 rounded hover:bg-gray-100 transition" title="Print Invoice">🖨 Print</button>
                                        <button onClick={() => handleViewPDF(`${API_URL}/api/customer-invoices/${inv._id}/pdf`)} className="text-blue-600 hover:text-blue-900 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 transition" title="View PDF">👁 View</button>
                                        <button onClick={() => handleSendWhatsApp(inv._id, inv.invoiceNumber)} className="text-green-600 hover:text-green-900 border border-green-200 px-2 py-1 rounded hover:bg-green-50 transition disabled:opacity-50" disabled={sendingWhatsApp === inv._id} title="Send via WhatsApp">{sendingWhatsApp === inv._id ? 'Sending...' : '📱 Send'}</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default CustomerInvoice;