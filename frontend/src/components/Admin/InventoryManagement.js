import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast'; 
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import { PRODUCT_CATEGORIES } from '../../Constants';

const initialProductState = { sku: '', name: '', category: PRODUCT_CATEGORIES.BATTERIES, price: 0, supplier: '' };
const ADD_NEW_CATEGORY = '__add_new_category__';

const InventoryManagement = () => {
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]); 
    const [loading, setLoading] = useState(true);
    
    // --- 🔍 NEW: SEARCH STATE ---
    const [searchTerm, setSearchTerm] = useState('');

    const [showForm, setShowForm] = useState(false); 
    const [viewingBatches, setViewingBatches] = useState(null); 
    
    const [isEditing, setIsEditing] = useState(false); 
    const [currentProductId, setCurrentProductId] = useState(null); 
    const [newProduct, setNewProduct] = useState(initialProductState); 
    const [selectedCategory, setSelectedCategory] = useState(PRODUCT_CATEGORIES.BATTERIES);
    const [customCategory, setCustomCategory] = useState('');

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [productsData, suppliersData] = await Promise.all([
                    apiClient.get('/api/products'),
                    apiClient.get('/api/suppliers') 
                ]);
                setProducts(productsData);
                setSuppliers(suppliersData); 
            } catch (err) {
                toast.error(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    // --- 🔍 NEW: FILTER LOGIC ---
    const filteredProducts = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const categoryOptions = Array.from(
        new Set([
            PRODUCT_CATEGORIES.BATTERIES,
            ...products.map((product) => (product.category || '').trim()).filter(Boolean)
        ])
    ).sort((a, b) => a.localeCompare(b));

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'category') {
            setSelectedCategory(value);
            if (value === ADD_NEW_CATEGORY) {
                setNewProduct(prev => ({ ...prev, category: '' }));
                return;
            }
            setCustomCategory('');
        }

        setNewProduct(prev => ({ ...prev, [name]: value }));
    };

    const handleCustomCategoryChange = (e) => {
        const value = e.target.value;
        setCustomCategory(value);
        setNewProduct(prev => ({ ...prev, category: value }));
    };

    const handleAddNew = () => {
        setIsEditing(false);
        setNewProduct(initialProductState);
        setSelectedCategory(PRODUCT_CATEGORIES.BATTERIES);
        setCustomCategory('');
        setCurrentProductId(null);
        setShowForm(true);
    };

    const handleEdit = (product) => {
        setIsEditing(true);
        setNewProduct({
            sku: product.sku,
            name: product.name,
            category: product.category,
            price: product.price,
            supplier: product.supplier || '' 
        });
        setSelectedCategory(product.category || PRODUCT_CATEGORIES.BATTERIES);
        setCustomCategory('');
        setCurrentProductId(product._id);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const finalCategory = (newProduct.category || '').trim();
        if (!finalCategory) {
            return toast.error('Category is required');
        }

        setLoading(true);
        const toastId = toast.loading(isEditing ? "Updating Product..." : "Adding Product...");

        try {
            let data;
            const payload = { ...newProduct, category: finalCategory };
            if (isEditing) {
                data = await apiClient.put(`/api/products/${currentProductId}`, payload);
                setProducts(prev => prev.map(p => p._id === currentProductId ? data : p));
            } else {
                data = await apiClient.post('/api/products', payload);
                setProducts(prev => [data, ...prev]);
            }
            setShowForm(false);
            toast.success(`Product ${isEditing ? 'updated' : 'created'} successfully!`, { id: toastId });
        } catch (err) {
            toast.error(err.message, { id: toastId });
        } finally {
            setLoading(false);
        }
    };
    
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString();
    const getSortedBatches = (batches) => {
        if (!batches) return [];
        return [...batches].sort((a, b) => new Date(a.receivedDate) - new Date(b.receivedDate));
    };

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Inventory Management</h1>
            
            {/* --- 🔍 NEW: HEADER WITH SEARCH BAR --- */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="relative w-full md:w-1/3">
                    <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                    <input 
                        type="text" 
                        placeholder="Search SKU or Name..." 
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <button onClick={handleAddNew} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition shadow-md w-full md:w-auto">
                    + Add New Product
                </button>
            </div>

            {/* TABLE USING FILTERED PRODUCTS */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <Table 
                    columns={['SKU', 'Name', 'Stock', 'Selling Price', 'Avg. Cost', 'Actions']}
                    loading={loading}
                >
                    {filteredProducts.length > 0 ? (
                        filteredProducts.map(product => (
                            <tr key={product._id} className="hover:bg-gray-50 border-b">
                                <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-600">{product.sku}</td>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{product.name}</td>
                                <td className={`px-6 py-4 whitespace-nowrap font-bold ${product.totalStock <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                                    {product.totalStock}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Rs {product.price.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Rs {product.averageCost?.toLocaleString() || '0'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button onClick={() => handleEdit(product)} className="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                                    <button onClick={() => setViewingBatches(product)} className="text-blue-600 hover:text-blue-900">View Batches</button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">
                                {searchTerm ? 'No products match your search.' : 'No products found.'}
                            </td>
                        </tr>
                    )}
                </Table>
            </div>

             {/* FORM MODAL */}
             <Modal 
                isOpen={showForm} 
                onClose={() => setShowForm(false)} 
                title={isEditing ? 'Edit Product' : 'Add New Product'}
            >
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">SKU (Unique ID)</label>
                            <input type="text" name="sku" placeholder="e.g. NS40-VOLTA" value={newProduct.sku} onChange={handleChange} required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Product Name</label>
                            <input type="text" name="name" placeholder="e.g. Volta Battery NS40" value={newProduct.name} onChange={handleChange} required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
                                <select name="category" value={selectedCategory} onChange={handleChange} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                    <option value={ADD_NEW_CATEGORY}>+ Add New Category</option>
                                </select>
                                {selectedCategory === ADD_NEW_CATEGORY && (
                                    <input
                                        type="text"
                                        placeholder="Enter new category"
                                        value={customCategory}
                                        onChange={handleCustomCategoryChange}
                                        className="w-full p-2 border rounded mt-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        required
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Selling Price</label>
                                <input type="number" step="0.01" name="price" placeholder="0.00" value={newProduct.price} onChange={handleChange} required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Default Supplier</label>
                            <select name="supplier" value={newProduct.supplier} onChange={handleChange} className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Supplier (Optional)</option>
                                {suppliers.map(s => (<option key={s._id} value={s.name}>{s.name}</option>))}
                            </select>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3 border-t pt-4">
                        <button type="button" onClick={() => setShowForm(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium">Cancel</button>
                        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 font-bold shadow">
                            {loading ? "Saving..." : "Save Product"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* BATCHES MODAL */}
            <Modal 
                isOpen={!!viewingBatches} 
                onClose={() => setViewingBatches(null)} 
                title={viewingBatches ? `Stock Batches: ${viewingBatches.name}` : ''}
                maxWidth="max-w-3xl"
            >
                <div className="max-h-[60vh] overflow-y-auto border rounded bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Received Date (FIFO)</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Source / Origin</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Quantity</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Cost Price</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {viewingBatches && viewingBatches.batches && viewingBatches.batches.length > 0 ? (
                                getSortedBatches(viewingBatches.batches).map((batch, index) => (
                                    <tr key={batch._id || index} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(batch.receivedDate)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">{batch.source || 'Purchase'}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-blue-600">{batch.quantity}</td>
                                        <td className="px-4 py-3 text-sm text-green-700">Rs {batch.costPrice?.toFixed(2)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="4" className="text-center py-6 text-gray-400">No stock batches found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex justify-end">
                    <button type="button" onClick={() => setViewingBatches(null)} className="bg-gray-200 px-5 py-2 rounded-lg hover:bg-gray-300 font-medium text-gray-700">Close</button>
                </div>
            </Modal>
        </div>
    );
};

export default InventoryManagement;