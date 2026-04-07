import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import CustomerLedgerModal from '../Common/CustomerLedgerModal'; 

const CustomerAccounts = () => {
    const [customers, setCustomers] = useState([]); 
    const [selectedCustomer, setSelectedCustomer] = useState(null); 
    const [loading, setLoading] = useState(true); 
    const [ledgerLoading, setLedgerLoading] = useState(false);
    
    // UI States
    const [activeTab, setActiveTab] = useState('wholesale'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [ledgerFilter, setLedgerFilter] = useState('all');

    // Payment Modal States
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    
    // Ledger Print Modal State
    const [showLedgerPrintModal, setShowLedgerPrintModal] = useState(false);

    // Editing State
    const [editingPaymentId, setEditingPaymentId] = useState(null);

    const [paymentData, setPaymentData] = useState({
        amount: '',
        description: 'Cash Payment Received',
        date: new Date().toISOString().split('T')[0] 
    });
    const [formLoading, setFormLoading] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get('/api/customers');
            setCustomers(data);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const sortLedger = (ledger) => {
        if (!ledger || !Array.isArray(ledger)) return [];
        return ledger.sort((a, b) => {
            const dateA = new Date(a.transactionDate);
            const dateB = new Date(b.transactionDate);
            if (dateA.toDateString() === dateB.toDateString()) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            return dateB - dateA;
        });
    };

    const handleSelectCustomer = async (customerId) => {
        if (selectedCustomer?.customer?._id === customerId) return;

        setLedgerLoading(true);
        try {
            const data = await apiClient.get(`/api/payments/ledger/${customerId}`);
            if (data.ledger) {
                data.ledger = sortLedger(data.ledger);
            }
            setSelectedCustomer(data);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLedgerLoading(false);
        }
    };

    const refreshLedger = async () => {
        if (!selectedCustomer) return;
        try {
            const data = await apiClient.get(`/api/payments/ledger/${selectedCustomer.customer._id}`);
            if (data.ledger) data.ledger = sortLedger(data.ledger);
            setSelectedCustomer(data);
            fetchCustomers(); // Also refresh sidebar balances
        } catch(err) { console.error(err); }
    };

    const handleBackToCustomers = () => {
        setSelectedCustomer(null);
    };

    const isScrapEntry = (tx) => {
        const desc = (tx?.description || '').toLowerCase();
        const type = (tx?.type || '').toLowerCase();
        return desc.includes('scrap purchase') || desc.includes('scrap') || type === 'scrap';
    };

    const getFilteredLedger = (ledger = []) => {
        if (ledgerFilter === 'all') return ledger;
        if (ledgerFilter === 'scrap') return ledger.filter(isScrapEntry);
        if (ledgerFilter === 'payments') return ledger.filter((tx) => tx.type === 'Payment');
        if (ledgerFilter === 'sales') return ledger.filter((tx) => tx.debit > 0);
        return ledger;
    };

    // --- PAYMENT HANDLERS ---
    const openNewPaymentModal = () => {
        setEditingPaymentId(null);
        setPaymentData({ amount: '', description: 'Cash Payment Received', date: new Date().toISOString().split('T')[0] });
        setShowPaymentModal(true);
    };

    const openEditPaymentModal = (tx) => {
        setEditingPaymentId(tx._id);
        setPaymentData({
            amount: tx.credit, // Use the credit amount
            description: tx.description,
            date: new Date(tx.transactionDate).toISOString().split('T')[0]
        });
        setShowPaymentModal(true);
    };

    const handleDeletePayment = async (txId) => {
        if(!window.confirm("Are you sure you want to delete this payment? This will increase the customer's balance.")) return;
        
        const toastId = toast.loading("Deleting Payment...");
        try {
            await apiClient.delete(`/api/payments/${txId}`);
            toast.success("Payment deleted successfully", { id: toastId });
            refreshLedger();
        } catch (err) {
            toast.error(err.message, { id: toastId });
        }
    };

    const handlePaymentChange = (e) => {
        setPaymentData({ ...paymentData, [e.target.name]: e.target.value });
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        setFormLoading(true);
        const toastId = toast.loading(editingPaymentId ? "Updating Payment..." : "Processing Payment...");
        
        try {
            if (editingPaymentId) {
                // UPDATE EXISTING
                await apiClient.put(`/api/payments/${editingPaymentId}`, {
                    ...paymentData,
                    amount: parseFloat(paymentData.amount)
                });
                toast.success('Payment updated successfully!', { id: toastId });
            } else {
                // CREATE NEW
                await apiClient.post('/api/payments', {
                    ...paymentData,
                    customerId: selectedCustomer.customer._id,
                    amount: parseFloat(paymentData.amount)
                });
                toast.success('Payment received successfully!', { id: toastId });
            }
            
            setShowPaymentModal(false);
            refreshLedger();

        } catch (err) {
            toast.error(err.message, { id: toastId });
        } finally {
            setFormLoading(false);
        }
    };
    
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    const filteredCustomers = customers.filter(c => {
        const matchesTab = c.type === activeTab;
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
            c.name.toLowerCase().includes(searchLower) || 
            c.phone.includes(searchLower) ||
            (c.shopName && c.shopName.toLowerCase().includes(searchLower));
        
        return matchesTab && matchesSearch;
    });

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
            
            {/* TOP HEADER */}
            <div className={`bg-white border-b px-6 py-4 flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0 shadow-sm z-10 ${selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Accounts & Ledger
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Manage customer balances and payment history</p>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
                    {['wholesale', 'retail'].map((tab) => (
                        <button 
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSelectedCustomer(null); setSearchTerm(''); }}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold capitalize transition-all duration-200 ${
                                activeTab === tab 
                                    ? 'bg-white text-blue-600 shadow-md transform scale-105' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden p-0 md:p-6 md:gap-6 relative">
                
                {/* LEFT PANEL: CUSTOMER LIST */}
                <div className={`w-full md:w-1/3 lg:w-1/4 bg-white md:rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden ${selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b bg-white relative z-10">
                        <div className="relative">
                            <svg className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                                type="text"
                                placeholder="Search customers..."
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white border focus:border-blue-500 rounded-xl focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-700"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 bg-gray-50/50">
                        {loading ? (
                            <div className="flex justify-center items-center h-40">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            </div>
                        ) : filteredCustomers.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <p>No {activeTab} customers found.</p>
                            </div>
                        ) : (
                            filteredCustomers.map(c => (
                                <div 
                                    key={c._id}
                                    onClick={() => handleSelectCustomer(c._id)}
                                    className={`
                                        group relative p-4 rounded-xl cursor-pointer transition-all duration-200 border
                                        ${selectedCustomer?.customer._id === c._id 
                                            ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-100' 
                                            : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'}
                                    `}
                                >
                                    {selectedCustomer?.customer._id === c._id && (
                                        <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full"></div>
                                    )}

                                    <div className="flex justify-between items-start pl-2">
                                        <div>
                                            <h3 className={`font-bold text-sm ${selectedCustomer?.customer._id === c._id ? 'text-blue-700' : 'text-gray-800'}`}>
                                                {c.name}
                                            </h3>
                                            <div className="flex flex-col gap-0.5 mt-1">
                                                {c.shopName && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                                        {c.shopName}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    {c.phone}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-sm font-bold block ${
                                                c.currentBalance > 0 ? 'text-red-500' : 'text-green-600'
                                            }`}>
                                                {Math.round(c.currentBalance).toLocaleString()}
                                            </span>
                                            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Due</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: LEDGER DETAILS */}
                <div className={`w-full md:flex-1 bg-white md:rounded-2xl shadow-lg border border-gray-100 flex-col overflow-hidden relative ${!selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
                    
                    {ledgerLoading && (
                        <div className="absolute inset-0 bg-white/80 z-30 flex items-center justify-center backdrop-blur-sm">
                            <div className="bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3 border">
                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-gray-700 font-medium">Loading History...</span>
                            </div>
                        </div>
                    )}

                    {!selectedCustomer ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                                <svg className="w-10 h-10 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-700">No Customer Selected</h3>
                            <p className="text-gray-500 mt-2 text-center">Select a customer from the list to view their ledger.</p>
                        </div>
                    ) : (
                        <>
                            {/* Profile Header Widget */}
                            <div className="bg-gradient-to-r from-gray-50 to-white border-b p-4 md:p-6 flex flex-col gap-4">
                                
                                <button 
                                    onClick={handleBackToCustomers}
                                    className="md:hidden flex items-center text-gray-500 hover:text-blue-600 mb-2 font-bold text-sm"
                                >
                                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back to List
                                </button>

                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg shrink-0">
                                            {selectedCustomer.customer.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h2 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">{selectedCustomer.customer.name}</h2>
                                            <div className="flex flex-wrap gap-2 text-sm text-gray-500 mt-1">
                                                <span>{selectedCustomer.customer.phone}</span>
                                                {selectedCustomer.customer.shopName && (
                                                    <>
                                                        <span className="hidden md:inline text-gray-300">•</span>
                                                        <span className="bg-gray-100 px-2 rounded text-xs py-0.5">{selectedCustomer.customer.shopName}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex w-full lg:w-auto items-center gap-2">
                                        <div className="bg-white p-3 rounded-xl border shadow-sm mr-2 flex-1 lg:flex-none">
                                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Current Balance</p>
                                            <p className={`text-xl font-bold leading-none mt-1 ${selectedCustomer.customer.currentBalance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                <span className="text-sm align-top opacity-50 mr-1">Rs</span>
                                                {selectedCustomer.customer.currentBalance.toLocaleString()}
                                            </p>
                                        </div>
                                        
                                        <button 
                                            onClick={() => setShowLedgerPrintModal(true)}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-3 rounded-lg shadow-sm transition-all flex items-center justify-center"
                                            title="Print Ledger"
                                        >
                                            <span className="text-xl">🖨️</span>
                                        </button>

                                        <button
                                            onClick={openNewPaymentModal}
                                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-bold shadow-green-200 shadow-md transition-all active:scale-95 flex items-center gap-2 text-sm md:text-base whitespace-nowrap"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                            Receive Pay
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                    {[
                                        { key: 'all', label: 'All' },
                                        { key: 'scrap', label: 'Scrap' },
                                        { key: 'payments', label: 'Payments' },
                                        { key: 'sales', label: 'Sales/Bills' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            onClick={() => setLedgerFilter(opt.key)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                                ledgerFilter === opt.key
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Ledger Table Container */}
                            <div className="flex-1 bg-gray-50 p-0 md:p-4 overflow-hidden flex flex-col">
                                <div className="bg-white md:rounded-xl shadow-sm border-t md:border border-gray-200 flex-1 overflow-hidden flex flex-col">
                                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                                        <Table 
                                            columns={['Date', 'Description', 'Debit (Bill)', 'Credit (Pay)', 'Balance']}
                                            loading={false}
                                            className="w-full text-left"
                                        >
                                            {getFilteredLedger(selectedCustomer.ledger).map(tx => (
                                                <tr key={tx._id} className={`hover:bg-blue-50/30 transition-colors border-b last:border-0 text-sm ${tx.type === 'Initial Balance' ? 'bg-yellow-50/50' : ''} ${isScrapEntry(tx) ? 'bg-amber-50/60' : ''}`}>
                                                    <td className="px-4 py-3 md:px-6 md:py-4 text-gray-500 font-mono text-xs whitespace-nowrap">
                                                        <div>{formatDate(tx.transactionDate)}</div>
                                                        <div className="text-[10px] text-blue-400 mt-0.5 md:hidden">
                                                            {tx.invoiceRef && (typeof tx.invoiceRef === 'object' ? `#${tx.invoiceRef.invoiceNumber}` : '')}
                                                        </div>
                                                    </td>
                                                    
                                                    <td className="px-4 py-3 md:px-6 md:py-4 font-medium text-gray-800 min-w-[120px]">
                                                        {tx.description}
                                                        {tx.type === 'Initial Balance' && <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[9px] font-bold rounded-full uppercase tracking-wide">Opening</span>}
                                                        {isScrapEntry(tx) && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full uppercase tracking-wide">Scrap</span>}
                                                        {tx.invoiceRef && (typeof tx.invoiceRef === 'object') && (
                                                            <span className="hidden md:inline-block ml-2 text-xs text-blue-500 bg-blue-50 px-1 rounded">#{tx.invoiceRef.invoiceNumber}</span>
                                                        )}
                                                        {/* 🚀 EDIT/DELETE BUTTONS FOR PAYMENTS */}
                                                        {tx.type === 'Payment' && (
                                                            <div className="inline-flex ml-3 gap-2 opacity-80">
                                                                <button 
                                                                    onClick={() => openEditPaymentModal(tx)}
                                                                    className="text-blue-500 hover:text-blue-700" 
                                                                    title="Edit Payment"
                                                                >
                                                                    ✏️
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeletePayment(tx._id)}
                                                                    className="text-red-400 hover:text-red-600" 
                                                                    title="Delete Payment"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3 md:px-6 md:py-4 text-center">
                                                        {tx.debit > 0 ? (
                                                            <span className="text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded text-xs md:text-sm">
                                                                {tx.debit.toLocaleString()}
                                                            </span>
                                                        ) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-4 py-3 md:px-6 md:py-4 text-center">
                                                        {tx.credit > 0 ? (
                                                            <span className="text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded text-xs md:text-sm">
                                                                {tx.credit.toLocaleString()}
                                                            </span>
                                                        ) : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-4 py-3 md:px-6 md:py-4 text-right font-bold text-gray-800 text-xs md:text-sm">
                                                        {tx.balance.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                            {getFilteredLedger(selectedCustomer.ledger).length === 0 && (
                                                <tr><td colSpan="5" className="text-center py-20 text-gray-400 italic">No {ledgerFilter === 'all' ? '' : ledgerFilter} transaction history found.</td></tr>
                                            )}
                                        </Table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            {/* PAYMENT MODAL (REUSED FOR EDITING) */}
            <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title={editingPaymentId ? "Edit Payment" : "Receive Payment"} maxWidth="max-w-md">
                <form onSubmit={handlePaymentSubmit}>
                    <div className="p-2 space-y-5">
                        <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl border border-blue-100 shadow-sm text-center">
                            <p className="text-xs text-blue-600 uppercase font-bold tracking-widest mb-1">Customer</p>
                            <p className="text-xl font-bold text-gray-800">{selectedCustomer?.customer.name}</p>
                            <div className="mt-2 inline-block bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-bold">
                                Due: Rs {selectedCustomer?.customer.currentBalance.toLocaleString()}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Amount Received</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3.5 text-gray-400 font-bold text-lg">Rs</span>
                                <input 
                                    type="number" step="1" name="amount" 
                                    value={paymentData.amount} onChange={handlePaymentChange} 
                                    placeholder="0" required 
                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-xl font-bold text-gray-800 placeholder-gray-300" 
                                />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                                <input 
                                    type="date" name="date" 
                                    value={paymentData.date} onChange={handlePaymentChange} 
                                    required 
                                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-700 bg-gray-50 focus:bg-white" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Reference</label>
                                <input 
                                    type="text" name="description" 
                                    value={paymentData.description} onChange={handlePaymentChange} 
                                    required 
                                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-700 bg-gray-50 focus:bg-white" 
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" onClick={() => setShowPaymentModal(false)} className="px-5 py-2.5 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition">Cancel</button>
                        <button type="submit" disabled={formLoading} className="bg-green-600 text-white px-8 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition shadow-lg shadow-green-200 font-bold flex items-center gap-2">
                            {formLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Saving...
                                </>
                            ) : (editingPaymentId ? "Update Payment" : "Confirm Payment")}
                        </button>
                    </div>
                </form>
            </Modal>

            {selectedCustomer && (
                <CustomerLedgerModal 
                    isOpen={showLedgerPrintModal} 
                    onClose={() => setShowLedgerPrintModal(false)} 
                    customerId={selectedCustomer.customer._id} 
                    customerName={selectedCustomer.customer.name} 
                />
            )}
        </div>
    );
};

export default CustomerAccounts;