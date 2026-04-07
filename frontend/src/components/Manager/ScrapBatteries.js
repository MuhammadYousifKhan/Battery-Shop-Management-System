import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';

const ScrapBatteries = () => {
    const [transactions, setTransactions] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [stats, setStats] = useState({ currentStock: 0, totalBoughtValue: 0, totalSoldValue: 0 });
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const [newTransaction, setNewTransaction] = useState({ 
        type: 'buy', 
        customerMode: 'walkin',
        supplierRef: '',
        settlementMode: 'receive_payment',
        customerRef: '',
        customerName: '',
        customerPhone: '',
        weight: '', 
        pricePerKg: '' 
    });

    const fetchTransactions = useCallback(async () => {
        setLoading(true); 
        try {
            const [data, customerData, supplierData] = await Promise.all([
                apiClient.get('/api/scrap'),
                apiClient.get('/api/customers'),
                apiClient.get('/api/suppliers')
            ]);

            setCustomers(Array.isArray(customerData) ? customerData : []);
            setSuppliers(Array.isArray(supplierData) ? supplierData : []);

            if (data.transactions) {
                setTransactions(data.transactions);
                setStats(data.stats);
            } else {
                setTransactions(data);
            }
        } catch (err) {
            toast.error(err.message);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]); 

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'customerMode') {
            setNewTransaction(prev => ({
                ...prev,
                customerMode: value,
                customerRef: '',
                customerName: value === 'dealer' ? prev.customerName : '',
                customerPhone: ''
            }));
            return;
        }

        if (name === 'customerRef') {
            const selected = customers.find(c => c._id === value);
            setNewTransaction(prev => ({
                ...prev,
                customerRef: value,
                customerName: selected?.name || prev.customerName,
                customerPhone: selected?.phone || ''
            }));
            return;
        }

        setNewTransaction(prev => ({ ...prev, [name]: value }));
    };

    const handleBuyClick = () => {
        setIsEditing(false);
        setEditingId(null);
        setNewTransaction({
            type: 'buy',
            customerMode: 'walkin',
            supplierRef: '',
            settlementMode: 'receive_payment',
            customerRef: '',
            customerName: '',
            customerPhone: '',
            weight: '',
            pricePerKg: ''
        });
        setShowForm(true);
    };

    const handleSellClick = () => {
        if (stats.currentStock <= 0) {
            toast.error("No scrap stock available to sell!");
            return;
        }
        setIsEditing(false);
        setEditingId(null);
        setNewTransaction({ 
            type: 'sell', 
            customerMode: 'dealer',
            supplierRef: '',
            settlementMode: 'receive_payment',
            customerRef: '',
            customerName: '', 
            customerPhone: '',
            weight: '', 
            pricePerKg: '' 
        });
        setShowForm(true);
    };

    const handleEditClick = (transaction) => {
        setIsEditing(true);
        setEditingId(transaction._id);

        const category = transaction.customerCategory || (transaction.type === 'sell' ? 'dealer' : (transaction.customerRef?.type || 'walkin'));

        setNewTransaction({
            type: transaction.type,
            customerMode: category,
            supplierRef: typeof transaction.supplierRef === 'object' ? (transaction.supplierRef?._id || '') : (transaction.supplierRef || ''),
            settlementMode: (transaction.settlementMode === 'receive' ? 'deduct_balance' : (transaction.settlementMode || 'receive_payment')),
            customerRef: typeof transaction.customerRef === 'object' ? (transaction.customerRef?._id || '') : (transaction.customerRef || ''),
            customerName: transaction.customerName,
            customerPhone: transaction.customerPhone || (typeof transaction.customerRef === 'object' ? (transaction.customerRef?.phone || '') : ''),
            weight: transaction.weight,
            pricePerKg: transaction.pricePerKg
        });
        setShowForm(true);
    };

    const handleDeleteClick = async (transaction) => {
        if (!window.confirm(`Are you sure you want to delete this ${transaction.type.toUpperCase()} entry?\n\n${transaction.customerName}\n${transaction.weight} Kg @ Rs ${transaction.pricePerKg}/Kg\nTotal: Rs ${transaction.totalAmount.toLocaleString()}`)) {
            return;
        }

        const toastId = toast.loading("Deleting...");
        try {
            await apiClient.delete(`/api/scrap/${transaction._id}`);
            toast.success("Transaction deleted!", { id: toastId });
            fetchTransactions();
        } catch (err) {
            toast.error(err.message, { id: toastId });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const weight = parseFloat(newTransaction.weight);
        const pricePerKg = parseFloat(newTransaction.pricePerKg);
        
        if (isNaN(weight) || weight <= 0) { toast.error("Invalid weight."); return; }
        if (isNaN(pricePerKg) || pricePerKg <= 0) { toast.error("Invalid price."); return; }

        if (newTransaction.type === 'buy') {
            if (newTransaction.customerMode === 'walkin') {
                if (!newTransaction.customerName.trim()) { toast.error('Walk-in customer name is required.'); return; }
                if (!newTransaction.customerPhone.trim()) { toast.error('Walk-in phone is required for ledger integrity.'); return; }
            }
            if ((newTransaction.customerMode === 'retail' || newTransaction.customerMode === 'wholesale') && !newTransaction.customerRef) {
                toast.error('Please select a customer.');
                return;
            }
        } else {
            if (!newTransaction.supplierRef) {
                toast.error('Please select supplier for scrap sale.');
                return;
            }
        }

        if (newTransaction.type === 'sell' && weight > stats.currentStock) {
            toast.error(`Cannot sell more than available stock (${stats.currentStock} Kg).`);
            return;
        }
        
        const toastId = toast.loading(isEditing ? "Updating..." : "Saving Transaction...");
        try {
            const payload = {
                ...newTransaction,
                customerCategory: newTransaction.customerMode,
                settlementMode: newTransaction.type === 'sell' ? newTransaction.settlementMode : undefined,
                weight,
                pricePerKg
            };
            
            if (isEditing) {
                await apiClient.put(`/api/scrap/${editingId}`, payload);
                toast.success("Transaction updated!", { id: toastId });
            } else {
                await apiClient.post('/api/scrap', payload);
                toast.success("Transaction added!", { id: toastId });
            }

            setShowForm(false);
            setIsEditing(false);
            setEditingId(null);
            fetchTransactions(); 
        } catch (err) { toast.error(err.message, { id: toastId }); }
    };

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const customerOptions = customers.filter(c => c.type === newTransaction.customerMode);

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Scrap Batteries</h1>

            {loading && !showForm && <p className="text-center text-blue-600">Loading...</p>}

            {!loading && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                            <h3 className="text-gray-500 text-sm font-medium">Current Stock (Kg)</h3>
                            <p className="text-2xl font-bold text-blue-700">{stats.currentStock ? stats.currentStock.toFixed(2) : 0} Kg</p>
                        </div>
                        {/* ✅ UPDATED LABEL: Shows 'Current Stock Value' (Asset) instead of 'Total Bought' */}
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                            <h3 className="text-gray-500 text-sm font-medium">Current Stock Value</h3>
                            <p className="text-2xl font-bold text-green-700">Rs {stats.totalBoughtValue ? stats.totalBoughtValue.toLocaleString() : 0}</p>
                            <span className="text-xs text-green-600">Asset in Hand</span>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                            <h3 className="text-gray-500 text-sm font-medium">Total Sold Value</h3>
                            <p className="text-2xl font-bold text-red-700">Rs {stats.totalSoldValue ? stats.totalSoldValue.toLocaleString() : 0}</p>
                        </div>
                    </div>

                    <div className="mb-6 flex gap-4">
                        <button onClick={handleBuyClick} className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition shadow-md flex items-center">
                            <span className="mr-2">+</span> Buy Scrap
                        </button>
                        <button onClick={handleSellClick} disabled={stats.currentStock <= 0} className={`px-6 py-3 rounded-lg font-semibold transition shadow-md flex items-center ${stats.currentStock > 0 ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                            <span className="mr-2">↗</span> Sell Scrap
                        </button>
                    </div>

                    <Table 
                        columns={['Date', 'Type', 'Party Name', 'Category', 'Weight', 'Rate / Kg', 'Total', 'Actions']}
                        loading={false}
                        title="Transaction History"
                    >
                        {transactions.map(t => (
                            <tr key={t._id} className={t.type === 'sell' ? 'bg-red-50' : ''}>
                                <td className="px-6 py-4 whitespace-nowrap">{formatDate(t.date)}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${t.type === 'buy' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                        {t.type.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">{t.customerName}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700 uppercase">
                                        {t.customerCategory || (t.type === 'sell' ? 'dealer' : 'walkin')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap font-bold">{t.weight} Kg</td>
                                <td className="px-6 py-4 whitespace-nowrap">Rs {t.pricePerKg}</td>
                                <td className="px-6 py-4 whitespace-nowrap font-bold">Rs {t.totalAmount.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleEditClick(t)} 
                                            className="text-blue-600 hover:text-blue-800 font-semibold text-sm hover:underline"
                                        >
                                            Edit
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteClick(t)} 
                                            className="text-red-600 hover:text-red-800 font-semibold text-sm hover:underline"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </Table>
                </>
            )}

            <Modal isOpen={showForm} onClose={() => { setShowForm(false); setIsEditing(false); setEditingId(null); }} title={isEditing ? 'Edit Transaction' : (newTransaction.type === 'buy' ? 'Buy Scrap (Stock In)' : 'Sell Scrap (Stock Out)')}>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        {newTransaction.type === 'buy' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Customer Type</label>
                                    <select
                                        name="customerMode"
                                        value={newTransaction.customerMode}
                                        onChange={handleChange}
                                        className="w-full p-3 border rounded mt-1 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="walkin">Walk-in Customer</option>
                                        <option value="retail">Retail Customer</option>
                                        <option value="wholesale">Wholesale Customer</option>
                                    </select>
                                </div>

                                {(newTransaction.customerMode === 'retail' || newTransaction.customerMode === 'wholesale') ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Select Customer</label>
                                        <select
                                            name="customerRef"
                                            value={newTransaction.customerRef}
                                            onChange={handleChange}
                                            className="w-full p-3 border rounded mt-1 focus:ring-2 focus:ring-blue-500"
                                            required
                                        >
                                            <option value="">Select customer</option>
                                            {customerOptions.map((c) => (
                                                <option key={c._id} value={c._id}>
                                                    {c.name} ({c.phone})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Walk-in Name</label>
                                            <input
                                                type="text"
                                                name="customerName"
                                                value={newTransaction.customerName}
                                                onChange={handleChange}
                                                placeholder="Walk-in customer"
                                                className="w-full p-3 border rounded mt-1 focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Walk-in Phone</label>
                                            <input
                                                type="text"
                                                name="customerPhone"
                                                value={newTransaction.customerPhone}
                                                onChange={handleChange}
                                                placeholder="03XXXXXXXXX"
                                                className="w-full p-3 border rounded mt-1 focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Select Supplier</label>
                                <select
                                    name="supplierRef"
                                    value={newTransaction.supplierRef || ''}
                                    onChange={(e) => {
                                        const supplierId = e.target.value;
                                        const selected = suppliers.find(s => s._id === supplierId);
                                        setNewTransaction(prev => ({
                                            ...prev,
                                            supplierRef: supplierId,
                                            customerName: selected?.name || '',
                                            customerPhone: selected?.phone || ''
                                        }));
                                    }}
                                    className="w-full p-3 border rounded mt-1 focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">Select supplier</option>
                                    {suppliers.map((s) => (
                                        <option key={s._id} value={s._id}>
                                            {s.name} ({s.phone})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {newTransaction.type === 'sell' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Settlement Mode</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${newTransaction.settlementMode === 'receive_payment' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                                        <input
                                            type="radio"
                                            name="settlementMode"
                                            value="receive_payment"
                                            checked={newTransaction.settlementMode === 'receive_payment'}
                                            onChange={handleChange}
                                        />
                                        <div>
                                            <p className="font-semibold text-gray-800">Receive Payment from Supplier</p>
                                            <p className="text-xs text-gray-500">Supplier gives cash/payment for this scrap sale</p>
                                        </div>
                                    </label>
                                    <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${newTransaction.settlementMode === 'deduct_balance' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                                        <input
                                            type="radio"
                                            name="settlementMode"
                                            value="deduct_balance"
                                            checked={newTransaction.settlementMode === 'deduct_balance'}
                                            onChange={handleChange}
                                        />
                                        <div>
                                            <p className="font-semibold text-gray-800">Deduct from Supplier Balance</p>
                                            <p className="text-xs text-gray-500">Adjust this amount against supplier payable balance</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Weight (Kg)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={newTransaction.type === 'sell' ? stats.currentStock : undefined}
                                name="weight"
                                value={newTransaction.weight}
                                onChange={handleChange}
                                placeholder="e.g. 12.5"
                                required
                                className="w-full p-3 border rounded mt-1"
                            />
                            {newTransaction.type === 'sell' && (
                                <p className="text-xs text-gray-500 mt-1">Available stock: {stats.currentStock} Kg</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Price Per Kg (Rs)</label>
                            <input type="number" step="0.01" name="pricePerKg" value={newTransaction.pricePerKg} onChange={handleChange} placeholder="e.g. 400" required className="w-full p-3 border rounded mt-1" />
                        </div>

                        {/* Show calculated total */}
                        <div className="bg-gray-50 p-3 rounded border">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Calculated Total:</span>
                                <span className="font-bold text-gray-800">
                                    Rs {((parseFloat(newTransaction.weight) || 0) * (parseFloat(newTransaction.pricePerKg) || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={() => { setShowForm(false); setIsEditing(false); setEditingId(null); }} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" disabled={loading} className={`text-white px-4 py-2 rounded-lg disabled:opacity-50 ${newTransaction.type === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                            {loading ? "Saving..." : (isEditing ? "Update" : (newTransaction.type === 'buy' ? "Save Purchase" : "Confirm Sale"))}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ScrapBatteries;