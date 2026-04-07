import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import { handlePrintPDF } from '../../utils/printHandler';

const InvoiceSystem = () => {
    const [invoices, setInvoices] = useState([]);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false); 
    const [editId, setEditId] = useState(null);        

    const [supplierRef, setSupplierRef] = useState('');
    const [invoiceStatus, setInvoiceStatus] = useState('draft'); 
    
    const [invoiceItems, setInvoiceItems] = useState([]); 
    // "Current Item" state is now just for selecting the product initially
    const [currentItem, setCurrentItem] = useState({
        productRef: '', productName: '', quantity: 1, price: 0 
    });

    const [showViewModal, setShowViewModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [invoicesData, productsData, suppliersData] = await Promise.all([
                    apiClient.get('/api/invoices'),
                    apiClient.get('/api/products'),
                    apiClient.get('/api/suppliers')
                ]);
                
                setInvoices(invoicesData);
                setProducts(productsData);
                setSuppliers(suppliersData);
            } catch (err) { toast.error(err.message); } finally { setLoading(false); }
        };
        fetchInitialData();
    }, []);

    // 1. Handle Product Selection (Top Bar)
    const handleItemChange = (e) => {
        const { name, value } = e.target;
        let updatedState = { ...currentItem, [name]: value };

        if (name === 'productRef') {
            const selectedProduct = products.find(p => p._id === value);
            updatedState.productName = selectedProduct ? selectedProduct.sku : '';
            updatedState.price = 0; 
            updatedState.quantity = 1; 

            if (selectedProduct && selectedProduct.supplier) {
                const matchedSupplier = suppliers.find(s => s.name === selectedProduct.supplier);
                if (matchedSupplier) setSupplierRef(matchedSupplier._id); 
            }
        }
        setCurrentItem(updatedState);
    };

    // 2. Add Item to List
    const handleAddItem = (e) => {
        e.preventDefault(); 
        if (!currentItem.productRef) {
            toast.error("Please select a product."); return;
        }
        
        // Check if product already exists in list, if so, just ignore or warn
        const exists = invoiceItems.find(i => i.productRef === currentItem.productRef);
        if (exists) {
            toast.error("Product already in list. Edit the quantity below.");
            return;
        }

        // Add with default quantity 1 and price 0 if not set, user can edit in table
        setInvoiceItems([...invoiceItems, {
            productRef: currentItem.productRef, 
            productName: currentItem.productName, 
            quantity: 1, 
            price: 0 
        }]);
        
        // Reset selection
        setCurrentItem({ productRef: '', productName: '', quantity: 1, price: 0 });
    };

    // 3. EDIT ROW FUNCTION (New Feature)
    const handleRowEdit = (index, field, value) => {
        const newItems = [...invoiceItems];
        newItems[index][field] = parseFloat(value) || 0;
        setInvoiceItems(newItems);
    };

    const handleRemoveItem = (index) => setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    
    const totalAmount = invoiceItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);

    const handleEditInvoice = (invoice) => {
        if (invoice.status === 'cancelled') {
            toast.error("Cannot edit a cancelled invoice.");
            return;
        }
        setIsEditing(true);
        setEditId(invoice._id);
        setSupplierRef(invoice.supplier._id || invoice.supplier); 
        setInvoiceStatus(invoice.status);
        
        const items = invoice.items.map(item => ({
            productRef: item.productRef,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price
        }));
        setInvoiceItems(items);
        setShowForm(true);
    };

    const resetForm = () => {
        setShowForm(false);
        setSupplierRef('');
        setInvoiceItems([]);
        setIsEditing(false);
        setEditId(null);
        setInvoiceStatus('draft');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!supplierRef || invoiceItems.length === 0) { toast.error("Select supplier and add items."); return; }
        
        const toastId = toast.loading(isEditing ? "Updating Invoice..." : "Creating Draft Invoice...");
        try {
            const payload = { 
                supplierRef, 
                items: invoiceItems, 
                totalAmount, 
                status: isEditing ? invoiceStatus : 'draft' 
            };
            
            let data;
            if (isEditing) {
                data = await apiClient.put(`/api/invoices/${editId}`, payload);
                setInvoices(prev => prev.map(inv => inv._id === editId ? data : inv));
                toast.success("Invoice Updated!", { id: toastId });
            } else {
                data = await apiClient.post('/api/invoices', payload);
                setInvoices(prev => [data, ...prev]);
                toast.success("Draft Invoice Created!", { id: toastId });
            }
            resetForm();
        } catch (err) { toast.error(err.message, { id: toastId }); }
    };

    const handleCompleteInvoice = async (invoiceId) => {
        if (!window.confirm("Complete this invoice?\nThis will add stock to inventory and update supplier ledger.")) return;
        const toastId = toast.loading("Posting Invoice...");
        try {
            const res = await apiClient.patch(`/api/invoices/${invoiceId}/complete`);
            setInvoices(prev => prev.map(inv => inv._id === invoiceId ? res.invoice : inv));
            toast.success("Invoice Posted Successfully!", { id: toastId });
        } catch (err) {
            toast.error(err.message, { id: toastId });
        }
    };

    const handleCancelInvoice = async (invoiceId) => {
        if (!window.confirm("Are you sure you want to CANCEL this invoice?\n\n- Stock will be removed.\n- Ledger entry will be reversed.\n- This cannot be undone.")) return;
        const toastId = toast.loading("Cancelling Invoice...");
        try {
            const res = await apiClient.patch(`/api/invoices/${invoiceId}/cancel`);
            setInvoices(prev => prev.map(inv => inv._id === invoiceId ? res.invoice : inv));
            toast.success("Invoice Cancelled!", { id: toastId });
        } catch (err) {
            toast.error(err.message, { id: toastId });
        }
    };

    const handleViewDetails = (invoice) => {
        setSelectedInvoice(invoice);
        setShowViewModal(true);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'draft': return <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">DRAFT</span>;
            case 'pending': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">POSTED</span>;
            case 'paid': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">PAID</span>;
            case 'cancelled': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">CANCELLED</span>;
            default: return null;
        }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Supplier Invoice System</h1>
            <div className="mb-6">
                <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition w-full md:w-auto">
                    Add New Supplier Invoice
                </button>
            </div>
            <Table 
                columns={['Date', 'Invoice #', 'Supplier', 'Status', 'Total', 'Actions']}
                loading={loading}
                title="Purchase History"
            >
                {invoices.map(invoice => (
                    <tr key={invoice._id} className="border-b hover:bg-gray-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono">{invoice.invoiceNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{invoice.supplier?.name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(invoice.status)}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">Rs {invoice.totalAmount.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap flex items-center space-x-2">
                            {invoice.status === 'draft' && (
                                <button onClick={() => handleCompleteInvoice(invoice._id)} className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-xs font-bold shadow">Complete</button>
                            )}
                            <button onClick={() => handleViewDetails(invoice)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">View</button>
                            {invoice.status !== 'cancelled' && (
                                <button onClick={() => handleEditInvoice(invoice)} className="text-orange-600 hover:text-orange-800 font-medium text-sm">Edit</button>
                            )}
                            <button onClick={() => handlePrintPDF(`/api/invoices/${invoice._id}/pdf`)} className="text-gray-600 hover:text-black font-medium text-sm">Print</button>
                            {invoice.status !== 'cancelled' && invoice.status !== 'draft' && (
                                <button onClick={() => handleCancelInvoice(invoice._id)} className="text-red-600 hover:text-red-800 font-bold text-sm ml-2">Cancel</button>
                            )}
                        </td>
                    </tr>
                ))}
            </Table>

            {/* FORM MODAL */}
            <Modal isOpen={showForm} onClose={resetForm} title={isEditing ? `Edit ${invoiceStatus === 'draft' ? 'Draft' : 'Posted'} Invoice` : "Add New Draft Invoice"} maxWidth="max-w-5xl">
                <div className="flex flex-col h-[80vh]"> {/* Fixed height for modal content */}
                    
                    {/* Fixed Top Section: Item Entry */}
                    <div className="flex-none p-4 border-b bg-gray-50 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-10">
                            <label className="text-xs font-bold text-gray-500 uppercase">Select Product to Add</label>
                            <select name="productRef" value={currentItem.productRef} onChange={handleItemChange} className="w-full p-3 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Product (SKU - Company)</option>
                                {products.map(p => (<option key={p._id} value={p._id}>{p.sku} - {p.name}</option>))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <button onClick={handleAddItem} className="w-full bg-gray-800 text-white py-3 rounded-lg hover:bg-gray-900 font-bold">
                                + Add
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Middle Section: Item List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100 text-gray-600 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 border-b">Product Name</th>
                                    <th className="p-3 w-32 border-b">Qty</th>
                                    <th className="p-3 w-40 border-b">Cost (Rs)</th>
                                    <th className="p-3 w-40 border-b">Total</th>
                                    <th className="p-3 w-10 border-b"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {invoiceItems.length === 0 ? (
                                    <tr><td colSpan="5" className="p-10 text-center text-gray-400 italic">No items added yet.</td></tr>
                                ) : (
                                    invoiceItems.map((item, index) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="p-3 font-bold font-mono text-gray-800">{item.productName}</td>
                                            
                                            {/* EDITABLE QUANTITY */}
                                            <td className="p-3">
                                                <input 
                                                    type="number" 
                                                    value={item.quantity} 
                                                    onChange={(e) => handleRowEdit(index, 'quantity', e.target.value)}
                                                    className="w-full p-2 border rounded text-center font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                    min="1"
                                                />
                                            </td>

                                            {/* EDITABLE PRICE */}
                                            <td className="p-3">
                                                <input 
                                                    type="number" 
                                                    value={item.price} 
                                                    onChange={(e) => handleRowEdit(index, 'price', e.target.value)}
                                                    className="w-full p-2 border rounded text-right focus:ring-2 focus:ring-blue-500 outline-none"
                                                    min="0"
                                                />
                                            </td>

                                            <td className="p-3 text-right font-bold text-gray-700">
                                                {(item.quantity * item.price).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 font-bold hover:bg-red-50 p-2 rounded">✕</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Fixed Bottom Section: Totals & Actions */}
                    <div className="flex-none p-4 border-t bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center mb-4">
                            <select value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} required className="p-3 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium h-12 w-full">
                                <option value="">-- Select Supplier --</option>
                                {suppliers.map(s => (<option key={s._id} value={s._id}>{s.name}</option>))}
                            </select>
                            <div className="bg-gray-100 p-3 rounded border flex justify-between items-center h-12">
                                <span className="font-bold text-gray-500">NET TOTAL:</span>
                                <span className="font-bold text-xl text-blue-900">Rs {totalAmount.toLocaleString()}</span>
                            </div>
                        </div>

                        {!isEditing && (
                            <div className="mb-4 text-sm text-gray-500 italic bg-yellow-50 p-2 rounded border border-yellow-100">
                                ℹ️ This will be saved as a <b>Draft</b> first. You must click <b>"Complete"</b> on the list to add stock.
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button type="button" onClick={resetForm} className="bg-gray-200 px-6 py-2 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
                            <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 font-bold">
                                {loading ? "Saving..." : (isEditing ? "Update Invoice" : "Save Draft")}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* View Details Modal */}
            <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Invoice Details" maxWidth="max-w-2xl">
                {selectedInvoice && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                            <div><p className="text-sm text-gray-500">Invoice #</p><p className="font-bold text-gray-800">{selectedInvoice.invoiceNumber}</p></div>
                            <div><p className="text-sm text-gray-500">Supplier</p><p className="font-bold text-gray-800">{selectedInvoice.supplier?.name || 'Unknown'}</p></div>
                            <div><p className="text-sm text-gray-500">Status</p><div>{getStatusBadge(selectedInvoice.status)}</div></div>
                            <div><p className="text-sm text-gray-500">Date</p><p className="font-bold text-gray-800">{new Date(selectedInvoice.createdAt).toLocaleString()}</p></div>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold mb-2 border-b pb-2">Items</h3>
                            <div className="max-h-[40vh] overflow-y-auto border rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {selectedInvoice.items.map((item, index) => (
                                            <tr key={index}>
                                                <td className="px-4 py-2 text-sm font-bold font-mono text-gray-900">{item.productName}</td>
                                                <td className="px-4 py-2 text-sm text-gray-600">{item.quantity}</td>
                                                <td className="px-4 py-2 text-sm text-gray-600">Rs {item.price.toFixed(2)}</td>
                                                <td className="px-4 py-2 text-sm text-gray-800 font-semibold">Rs {(item.quantity * item.price).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-6 pt-4 border-t">
                            <button onClick={() => setShowViewModal(false)} className="text-gray-500 hover:text-gray-700 font-medium">Close</button>
                            <span className="text-xl font-bold text-blue-900">Total: Rs {selectedInvoice.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default InvoiceSystem;