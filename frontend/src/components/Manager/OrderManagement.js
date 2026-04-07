import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import API_URL from '../../apiConfig'; 
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import { STATUS } from '../../Constants';
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler';

// --- INTERNAL SEARCHABLE SELECT COMPONENT ---
const SearchableSelect = ({ options, value, onChange, placeholder, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    const filteredOptions = options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (value) {
            const selected = options.find(opt => opt.value === value);
            if (selected) setSearchTerm(selected.label);
        } else {
            setSearchTerm('');
        }
    }, [value, options]);

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <input
                type="text"
                className={`w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder={placeholder}
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                    if(e.target.value === '') onChange('');
                }}
                onFocus={() => !disabled && setIsOpen(true)}
                disabled={disabled}
            />
            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <div
                                key={option.value}
                                onClick={() => {
                                    onChange(option.value);
                                    setSearchTerm(option.label);
                                    setIsOpen(false);
                                }}
                                className="p-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm whitespace-pre-wrap"
                            >
                                {option.label}
                            </div>
                        ))
                    ) : (
                        <div className="p-2 text-gray-500 text-sm">No results found.</div>
                    )}
                </div>
            )}
        </div>
    );
};

const OrderManagement = () => {
    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [allProducts, setAllProducts] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [showOrderForm, setShowOrderForm] = useState(false);
    
    // --- SEARCH & FILTER STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState(''); 

    // --- LEDGER MODAL STATE ---
    const [showLedgerModal, setShowLedgerModal] = useState(false);
    const [ledgerData, setLedgerData] = useState({ 
        customerId: '', 
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });
    const [generating, setGenerating] = useState(false);

    // --- ORDER CREATION STATES ---
    const [selectedCustomerRef, setSelectedCustomerRef] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [orderItems, setOrderItems] = useState([]); 
    const [totalAmount, setTotalAmount] = useState(0);
    const [customerNIC, setCustomerNIC] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [currentItem, setCurrentItem] = useState({ productRef: '', sku: '', productName: '', quantity: 1, price: 0, stock: 0, chassisNumber: '', cost: 0 });
    
    // WhatsApp Loading State
    const [sendingWhatsApp, setSendingWhatsApp] = useState(null); 

    // --- EDIT STATES ---
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editNewItem, setEditNewItem] = useState({ productRef: '', sku: '', productName: '', quantity: 1, price: 0, stock: 0 });

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [ordersData, customersData, productsArray] = await Promise.all([
                    apiClient.get('/api/orders'),
                    apiClient.get('/api/customers'),
                    apiClient.get('/api/products')
                ]);
                setAllProducts(productsArray); 
                setOrders(ordersData);
                setCustomers(customersData);
            } catch (err) { toast.error(err.message); } finally { setLoading(false); }
        };
        fetchInitialData();
    }, []);

    const formatBillNo = (idString) => {
        if (!idString) return '---';
        const hexSegment = idString.slice(-6); 
        const decimalValue = parseInt(hexSegment, 16);
        if (isNaN(decimalValue)) return hexSegment;
        return decimalValue.toString().padStart(8, '0');
    };

    const filteredOrders = orders.filter(order => {
        const searchLower = searchTerm.toLowerCase();
        const customerName = order.customerName?.toLowerCase() || '';
        const billDecimal = formatBillNo(order.orderId || order._id);
        const amount = order.totalAmount?.toString() || '';
        
        const orderDateObj = new Date(order.createdAt);
        const orderDateStr = orderDateObj.toLocaleDateString();
        const orderDateISO = orderDateObj.toISOString().split('T')[0]; 

        const matchesSearch = customerName.includes(searchLower) || 
                              billDecimal.includes(searchLower) || 
                              amount.includes(searchLower) ||
                              orderDateStr.includes(searchLower);

        const matchesDate = filterDate ? orderDateISO === filterDate : true;

        return matchesSearch && matchesDate;
    });

    const handleLedgerAction = async (action) => {
        if (!ledgerData.customerId) return toast.error("Select a customer");
        const url = `${API_URL}/api/ledger/${ledgerData.customerId}/pdf?startDate=${ledgerData.startDate}&endDate=${ledgerData.endDate}`;

        if (action === 'print') {
            handlePrintPDF(url);
            toast.success("Preparing for print...");
        } else if (action === 'view') {
            handleViewPDF(url);
        } else if (action === 'whatsapp') {
            setGenerating(true);
            try {
                await apiClient.post(`/api/ledger/${ledgerData.customerId}/whatsapp`, {
                    startDate: ledgerData.startDate,
                    endDate: ledgerData.endDate
                });
                toast.success("Sent via WhatsApp!");
            } catch (err) {
                toast.error(err.message);
            } finally {
                setGenerating(false);
            }
        }
    };

    const handleCustomerSelect = (val) => { setSelectedCustomerRef(val); const c = customers.find(x=>x._id===val); if(c) setCustomerAddress(c.address); };
    
    const handleProductSelect = (val) => {
        if (!val) { setCurrentItem(prev => ({ ...prev, productRef: '' })); return; }
        const selectedProduct = allProducts.find(p => p._id === val);
        if (selectedProduct) {
            setCurrentItem(prev => ({
                ...prev, productRef: val, sku: selectedProduct.sku, productName: selectedProduct.name, price: selectedProduct.price, stock: selectedProduct.totalStock, cost: selectedProduct.averageCost
            }));
        }
    };

    const handleCurrentItemChange = (e) => {
        const { name, value } = e.target;
        let updatedState = { ...currentItem, [name]: value };
        if (name === 'quantity') { updatedState.quantity = parseInt(value, 10) || 1; }
        if (name === 'price') { updatedState.price = parseFloat(value) || 0; } 
        setCurrentItem(updatedState);
    };
    
    const handleOrderItemChange = (index, field, value) => {
        const newItems = [...orderItems];
        newItems[index][field] = parseFloat(value) || 0;
        setOrderItems(newItems);
    };

    useEffect(() => { setTotalAmount(orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0)); }, [orderItems]);

    const handleAddItemToOrder = (e) => {
        e.preventDefault(); 
        if (!currentItem.productRef) { toast.error("Select a product."); return; }
        
        setOrderItems(prev => [...prev, { ...currentItem, productType: 'Mixed' }]);
        setCurrentItem({ productRef: '', sku: '', productName: '', quantity: 1, price: 0, stock: 0, chassisNumber: '', cost: 0 });
        toast.success("Item added");
    };
    
    const handleRemoveItem = (idx) => { setOrderItems(prev => prev.filter((_, i) => i !== idx)); };
    const openOrderForm = () => {
        setSelectedCustomerRef('');
        setOrderDate(new Date().toISOString().split('T')[0]);
        setOrderItems([]);
        setTotalAmount(0);
        setShowOrderForm(true);
    };
    
    const handleCreateOrder = async (e) => {
        e.preventDefault(); 
        const toastId = toast.loading("Creating Order...");
        try {
            const payload = {
                customerRef: selectedCustomerRef,
                items: orderItems,
                totalAmount,
                productType: 'Mixed',
                nic: customerNIC,
                address: customerAddress,
                createdAt: orderDate
            };
            const data = await apiClient.post('/api/orders', payload);
            setOrders(prev => [data, ...prev]); setShowOrderForm(false); toast.success("Order created!", { id: toastId });
        } catch (err) { toast.error(err.message, { id: toastId }); }
    };

    const completeOrder = async (orderId) => {
        if (!window.confirm("Complete order and update customer ledger?")) { return; }
        try { 
            const data = await apiClient.patch(`/api/orders/${orderId}/complete`); 
            if (data && data._id) {
                setOrders(prev => prev.map(order => order._id === orderId ? data : order)); 
                toast.success("Order completed & Ledger Updated!"); 
            }
        } catch (err) { toast.error(err.message); }
    };

    // --- NEW: Handle Send Bill (WhatsApp) ---
    const handleSendBill = async (orderId) => { 
        setSendingWhatsApp(orderId); 
        const toastId = toast.loading("Sending WhatsApp...");
        try { 
            await apiClient.post(`/api/orders/${orderId}/send-bill`); 
            toast.success("Bill sent successfully!", { id: toastId }); 
        } catch (err) { 
            toast.error(err.message || "Failed to send", { id: toastId }); 
        } finally { 
            setSendingWhatsApp(null); 
        } 
    };

    const handleCancelOrder = async (orderId) => {
        if (!window.confirm("Are you sure you want to CANCEL this order?\n\n- Stock will be returned to inventory.\n- Customer balance/ledger will be reverted.\n- This action cannot be undone.")) return;

        const toastId = toast.loading("Cancelling Order...");
        try {
            const response = await apiClient.patch(`/api/orders/${orderId}/cancel`);
            toast.success("Order Cancelled Successfully", { id: toastId });
            setOrders(prev => prev.map(o => {
                if (o._id === orderId) {
                    return response.order || { ...o, status: 'cancelled' }; 
                }
                return o;
            }));
        } catch (err) {
            toast.error(err.message || "Failed to cancel order", { id: toastId });
        }
    };

    const openEditModal = (order) => {
        setShowEditModal(true);
        setEditingOrder(order);
        setEditNewItem({ productRef: '', sku: '', productName: '', quantity: 1, price: 0, stock: 0 });
    };

    const handleEditProductSelect = (val) => {
        if (!val) { setEditNewItem(prev => ({ ...prev, productRef: '' })); return; }
        const p = allProducts.find(x => x._id === val);
        if (p) setEditNewItem({ productRef: val, sku: p.sku, productName: p.name, price: p.price, quantity: 1, stock: p.totalStock });
    };

    const handleEditItemChange = (index, field, value) => {
        const newItems = [...editingOrder.items];
        newItems[index][field] = parseFloat(value) || 0;
        
        const newTotal = newItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        setEditingOrder({ ...editingOrder, items: newItems, totalAmount: newTotal });
    };

    const handleEditAddItem = () => {
        if (!editNewItem.productRef) return toast.error("Select product");
        const updated = [...editingOrder.items, editNewItem];
        const newTotal = updated.reduce((s, i) => s + (i.price * i.quantity), 0);
        setEditingOrder({ ...editingOrder, items: updated, totalAmount: newTotal });
    };

    const handleEditRemoveItem = (idx) => {
        const updated = editingOrder.items.filter((_, i) => i !== idx);
        const newTotal = updated.reduce((s, i) => s + (i.price * i.quantity), 0);
        setEditingOrder({ ...editingOrder, items: updated, totalAmount: newTotal });
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = { items: editingOrder.items, totalAmount: editingOrder.totalAmount, nic: editingOrder.nic, createdAt: editingOrder.createdAt };
            const updated = await apiClient.put(`/api/orders/${editingOrder._id}`, payload);
            setOrders(prev => prev.map(o => o._id === editingOrder._id ? updated : o));
            setShowEditModal(false); toast.success("Updated!");
        } catch (err) { toast.error(err.message); }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Wholesale Order Management</h1>
            
            <div className="mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                    <button onClick={openOrderForm} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold w-full md:w-auto hover:bg-blue-700 whitespace-nowrap">
                        + Create New Order
                    </button>
                    
                    <button onClick={() => setShowLedgerModal(true)} className="bg-purple-600 text-white px-5 py-2 rounded-lg font-semibold w-full md:w-auto hover:bg-purple-700 flex items-center justify-center gap-2 whitespace-nowrap">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        Print Ledger
                    </button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
                    <div className="flex flex-col w-full md:w-auto">
                         <span className="text-xs text-gray-500 mb-1 ml-1">Filter by Date</span>
                         <input 
                             type="date" 
                             className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-11 text-gray-700 bg-white"
                             value={filterDate}
                             onChange={(e) => setFilterDate(e.target.value)}
                          />
                    </div>

                    <div className="flex flex-col flex-grow w-full md:w-80 relative">
                        <span className="text-xs text-gray-500 mb-1 ml-1">Search</span>
                        <div className="relative">
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-11"
                                placeholder="Search by Customer, Bill No..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full overflow-hidden border rounded-lg shadow-sm">
                <Table columns={['Date', 'Bill No', 'Customer', 'Total', 'Status', 'Actions', 'WhatsApp', 'Print / View']} loading={loading}>
                    {filteredOrders.map(order => (
                        <tr key={order._id} className="hover:bg-gray-40">
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                                {new Date(order.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap font-mono text-sm text-black-800">
                                {formatBillNo(order.orderId || order._id)}
                            </td>
                            <td className="px-4 py-2 font-medium text-gray-600 truncate max-w-[200px]" title={order.customerName}>
                                {order.customerName}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-gray-600">Rs {order.totalAmount?.toLocaleString()}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                    order.status === STATUS.COMPLETED ? 'bg-green-100 text-green-600' : 
                                    order.status === 'cancelled' ? 'bg-gray-300 text-gray-600' :
                                    'bg-yellow-100 text-yellow-600'
                                }`}>
                                    {order.status}
                                </span>
                            </td>
                            <td className="px-4 py-2 text-sm font-medium whitespace-nowrap flex gap-2">
                                {order.status === STATUS.PROCESSING && (
                                    <button onClick={() => completeOrder(order._id)} className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-600 text-xs">
                                        Complete
                                    </button>
                                )}
                                
                                <button onClick={() => openEditModal(order)} className="text-blue-600 hover:underline ml-1">Edit</button>

                                {order.status !== 'cancelled' && (
                                    <button onClick={() => handleCancelOrder(order._id)} className="text-red-600 hover:underline ml-1 " title="Cancel Order & Revert Stock">
                                        Cancel
                                    </button>
                                )}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium whitespace-nowrap">
                                {order.status === STATUS.COMPLETED && (
                                    <button 
                                        onClick={() => handleSendBill(order._id)} 
                                        className={`font-bold hover:text-green-800 ${sendingWhatsApp === order._id ? 'text-gray-500 cursor-not-allowed' : 'text-green-600'}`} 
                                        disabled={sendingWhatsApp === order._id}
                                    >
                                        {sendingWhatsApp === order._id ? 'Sending...' : 'Send Bill'}
                                    </button>
                                )}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium whitespace-nowrap">
                                <div className="flex gap-2">
                                    <button onClick={() => handlePrintPDF(`${API_URL}/api/orders/${order._id}/pdf`)} className="text-blue-600 font-bold border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 text-xs">
                                         Print
                                    </button>
                                    <button onClick={() => handleViewPDF(`${API_URL}/api/orders/${order._id}/pdf`)} className="text-gray-600 font-bold border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 text-xs">
                                         View
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </div>
            
            {/* LEDGER MODAL */}
            <Modal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} title="Generate Wholesale Account Statement" maxWidth="max-w-md">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Select Customer</label>
                        <SearchableSelect 
                            options={customers.filter(c => c.type === 'wholesale').map(c => ({ value: c._id, label: `${c.name} (Shop: ${c.shopName || 'N/A'})` }))}
                            value={ledgerData.customerId} 
                            onChange={(val) => setLedgerData({ ...ledgerData, customerId: val })} 
                            placeholder="Search Wholesale Customer..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">From Date</label><input type="date" className="w-full p-2 border rounded" value={ledgerData.startDate} onChange={(e) => setLedgerData({ ...ledgerData, startDate: e.target.value })} /></div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">To Date</label><input type="date" className="w-full p-2 border rounded" value={ledgerData.endDate} onChange={(e) => setLedgerData({ ...ledgerData, endDate: e.target.value })} /></div>
                    </div>
                    <div className="pt-4 flex flex-col gap-2">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => handleLedgerAction('view')} className="flex-1 bg-gray-600 text-white py-2 rounded font-bold"> View</button>
                            <button type="button" onClick={() => handleLedgerAction('print')} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold"> Print Statement</button>
                        </div>
                        <button type="button" onClick={() => handleLedgerAction('whatsapp')} disabled={generating} className={`w-full text-white py-2 rounded font-bold flex items-center justify-center gap-2 ${generating ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
                            {generating ? 'Sending...' : 'Send via WhatsApp'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* CREATE ORDER MODAL */}
            <Modal isOpen={showOrderForm} onClose={() => setShowOrderForm(false)} title="Create New Wholesale Order" maxWidth="max-w-4xl">
                 <form onSubmit={handleCreateOrder} className="flex flex-col h-[80vh]">
                    
                    {/* Fixed Top Section: Inputs */}
                    <div className="flex-none p-4 border-b bg-gray-50 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold">Customer</label>
                                <SearchableSelect options={customers.filter(c => c.type === 'wholesale').map(c => ({ value: c._id, label: c.name }))} value={selectedCustomerRef} onChange={handleCustomerSelect} placeholder="Search Customer..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold">Order Date</label>
                                <input
                                    type="date"
                                    value={orderDate}
                                    onChange={(e) => setOrderDate(e.target.value)}
                                    required
                                    className="w-full p-2 border rounded mt-1 h-[42px]"
                                />
                            </div>
                        </div>
                        
                        <div className="p-3 border rounded-lg bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                <div className="lg:col-span-2">
                                    <label className="text-xs font-bold">Product (SKU)</label>
                                    <SearchableSelect options={allProducts.map(p => ({ value: p._id, label: `[${p.sku}] ${p.name} (Stock: ${p.totalStock})` }))} value={currentItem.productRef} onChange={handleProductSelect} placeholder="Select Product..." />
                                </div>
                                <div>
                                    <div className="flex justify-between">
                                        <label className="text-xs font-bold">Qty</label>
                                        {currentItem.productRef && <span className="text-xs text-blue-600 font-bold">Avail: {currentItem.stock}</span>}
                                    </div>
                                    <input type="number" name="quantity" value={currentItem.quantity} onChange={handleCurrentItemChange} className="w-full p-2 border rounded"/>
                                </div>
                                <div><label className="text-xs font-bold">Rate</label><input type="number" name="price" value={currentItem.price} onChange={handleCurrentItemChange} className="w-full p-2 border rounded font-bold text-red-600"/></div>
                                <div><button type="button" onClick={handleAddItemToOrder} className="bg-gray-800 text-white w-full p-2 rounded hover:bg-black font-bold">ADD ITEM</button></div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Scrollable Middle Section: Table */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {orderItems.length === 0 ? (
                            <p className="p-10 text-gray-400 text-center italic border border-dashed rounded">No items added to this order yet.</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-100 text-xs font-bold text-gray-600 uppercase sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 border-b">Product</th>
                                        <th className="p-3 w-24 border-b">Qty</th>
                                        <th className="p-3 w-32 border-b">Rate (Rs)</th>
                                        <th className="p-3 w-32 border-b">Total</th>
                                        <th className="p-3 w-10 border-b"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {orderItems.map((item, index) => (
                                        <tr key={index} className="hover:bg-blue-50">
                                            <td className="p-3 text-sm">
                                                <span className="font-bold text-blue-700 mr-2">[{item.sku}]</span>
                                                {item.productName}
                                            </td>
                                            <td className="p-3">
                                                <input 
                                                    type="number" 
                                                    value={item.quantity} 
                                                    onChange={(e) => handleOrderItemChange(index, 'quantity', e.target.value)}
                                                    className="w-full p-1 border rounded text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                    min="1"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input 
                                                    type="number" 
                                                    value={item.price} 
                                                    onChange={(e) => handleOrderItemChange(index, 'price', e.target.value)}
                                                    className="w-full p-1 border rounded text-right font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                                                    min="0"
                                                />
                                            </td>
                                            <td className="p-3 font-bold text-gray-700">
                                                Rs {(item.quantity * item.price).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 font-bold hover:bg-red-100 p-1 rounded">✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Fixed Bottom Section: Footer */}
                    <div className="flex-none p-4 border-t bg-white">
                        <div className="bg-gray-100 p-3 rounded flex justify-between items-center mb-4">
                            <span className="font-bold text-gray-600">Items: {orderItems.length}</span>
                            <span className="font-bold text-2xl text-blue-900">Total: Rs {totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowOrderForm(false)} className="px-6 py-2 rounded bg-gray-200 font-bold">Cancel</button>
                            <button type="submit" className="px-10 py-2 rounded bg-blue-600 text-white font-bold hover:bg-blue-700">Create Order</button>
                        </div>
                    </div>
                 </form>
            </Modal>

            {/* EDIT MODAL */}
            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Order" maxWidth="max-w-4xl">
                {editingOrder && (
                    <form onSubmit={handleEditSubmit} className="flex flex-col h-[80vh]">
                        
                        {/* Fixed Top */}
                        <div className="flex-none p-4 border-b bg-gray-50 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-bold">Date</label><input type="date" className="w-full p-2 border rounded" value={editingOrder.createdAt ? new Date(editingOrder.createdAt).toISOString().split('T')[0] : ''} onChange={e => setEditingOrder({...editingOrder, createdAt: e.target.value})} /></div>
                                <div><label className="text-sm font-bold">CNIC</label><input className="w-full p-2 border rounded" value={editingOrder.nic || ''} onChange={e => setEditingOrder({...editingOrder, nic: e.target.value})} /></div>
                            </div>
                            
                            <div className="p-3 bg-white border rounded">
                                <h4 className="font-bold text-xs mb-2 text-blue-600 uppercase">Add Item to Order</h4>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-grow">
                                        <label className="text-xs">Product</label>
                                        <SearchableSelect options={allProducts.map(p => ({ value: p._id, label: `[${p.sku}] ${p.name} (Stock: ${p.totalStock})` }))} value={editNewItem.productRef} onChange={handleEditProductSelect} placeholder="Search product..." />
                                    </div>
                                    <div className="w-20">
                                        <div className="flex justify-between"><label className="text-xs">Qty</label>{editNewItem.productRef && <span className="text-[10px] text-blue-600 font-bold">{editNewItem.stock}</span>}</div>
                                        <input type="number" className="w-full p-2 border rounded" value={editNewItem.quantity} onChange={e => setEditNewItem({...editNewItem, quantity: e.target.value})} />
                                    </div>
                                    <div className="w-24"><label className="text-xs">Price</label><input type="number" className="w-full p-2 border rounded" value={editNewItem.price} onChange={e => setEditNewItem({...editNewItem, price: e.target.value})} /></div>
                                    <button type="button" onClick={handleEditAddItem} className="bg-green-600 text-white px-3 py-2 rounded mb-[1px]">Add</button>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Middle */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-100 text-xs font-bold text-gray-600 uppercase sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-2 border-b">Product</th>
                                        <th className="p-2 w-20 border-b">Qty</th>
                                        <th className="p-2 w-24 border-b">Price</th>
                                        <th className="p-2 w-28 border-b">Total</th>
                                        <th className="p-2 w-10 border-b"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {editingOrder.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-2 text-sm">
                                                <div className="font-bold text-gray-700">[{item.sku || '?'}]</div>
                                                <div className="text-xs text-gray-500">{item.productName}</div>
                                            </td>
                                            <td className="p-2">
                                                <input 
                                                    type="number" 
                                                    value={item.quantity} 
                                                    onChange={(e) => handleEditItemChange(idx, 'quantity', e.target.value)}
                                                    className="w-full p-1 border rounded text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                                    min="1"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input 
                                                    type="number" 
                                                    value={item.price} 
                                                    onChange={(e) => handleEditItemChange(idx, 'price', e.target.value)}
                                                    className="w-full p-1 border rounded text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                                    min="0"
                                                />
                                            </td>
                                            <td className="p-2 font-bold text-gray-700 text-sm">
                                                Rs {(item.quantity * item.price).toLocaleString()}
                                            </td>
                                            <td className="p-2 text-center">
                                                <button type="button" onClick={() => handleEditRemoveItem(idx)} className="text-red-500 text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Fixed Bottom */}
                        <div className="flex-none p-4 border-t bg-white">
                            <div className="text-right mb-3 font-bold text-xl text-gray-800">
                                New Total: Rs {editingOrder.totalAmount.toLocaleString()}
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">Save Changes & Adjust Stock</button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default OrderManagement;