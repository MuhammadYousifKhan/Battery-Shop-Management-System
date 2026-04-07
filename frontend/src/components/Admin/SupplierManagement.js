import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import { handlePrintPDF, handleViewPDF } from '../../utils/printHandler';

const SupplierManagement = () => {
  const isAdmin = localStorage.getItem('userRole') === 'admin';
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // --- Form States ---
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', contactPerson: '', phone: '', address: '', openingBalance: ''
  });

  // --- Ledger States ---
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [scrapSettlements, setScrapSettlements] = useState([]);
  const [scrapSummary, setScrapSummary] = useState({ count: 0, deductedFromBalance: 0, paymentReceived: 0, paidToSupplier: 0, netPayableReduction: 0 });
  const [ledgerOpeningBalance, setLedgerOpeningBalance] = useState(0);
  const [ledgerClosingBalance, setLedgerClosingBalance] = useState(0); 
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [dateRange, setDateRange] = useState({
      startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
  });

  // --- Payment States ---
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '', date: new Date().toISOString().split('T')[0], description: 'Payment to Supplier'
  });

  // Fetch Logic
  const fetchSuppliers = async () => {
    try {
      const data = await apiClient.get('/api/suppliers');
      setSuppliers(data);
    } catch (error) { toast.error('Failed to fetch suppliers'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isEditing && !isAdmin) {
      toast.error('Only admin can edit suppliers.');
      return;
    }

    try {
      if (isEditing) {
        await apiClient.put(`/api/suppliers/${selectedSupplierId}`, formData);
        toast.success('Supplier updated successfully');
      } else {
        await apiClient.post('/api/suppliers', formData);
        toast.success('Supplier added successfully');
      }
      setIsFormModalOpen(false);
      fetchSuppliers();
    } catch (error) { toast.error(error.message); }
  };

  const fetchLedger = async (supplierId) => {
    setLedgerLoading(true);
    try {
        const query = `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
        const data = await apiClient.get(`/api/suppliers/${supplierId}/ledger${query}`);
        
        setSelectedSupplier(data.supplier); 
        setLedgerTransactions(data.ledger);
        setScrapSettlements(Array.isArray(data.scrapSettlements) ? data.scrapSettlements : []);
        setScrapSummary(data.scrapSummary || { count: 0, deductedFromBalance: 0, paymentReceived: 0, paidToSupplier: 0, netPayableReduction: 0 });
        setLedgerOpeningBalance(data.openingBalance || 0);
        setLedgerClosingBalance(data.closingBalance || 0); 
        
        setIsLedgerOpen(true);
    } catch (error) { toast.error("Failed to load ledger"); } finally { setLedgerLoading(false); }
  };

  useEffect(() => {
      if (isLedgerOpen && selectedSupplier) fetchLedger(selectedSupplier._id);
  }, [dateRange.startDate, dateRange.endDate]);

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Only admin can record supplier payments.');
      return;
    }

    if (!selectedSupplier) return;
    try {
        await apiClient.post(`/api/suppliers/${selectedSupplier._id}/payment`, {
            ...paymentData, amount: parseFloat(paymentData.amount)
        });
        toast.success("Payment Recorded!");
        setIsPaymentModalOpen(false);
        setPaymentData({ amount: '', date: new Date().toISOString().split('T')[0], description: 'Payment to Supplier' });
        fetchLedger(selectedSupplier._id); 
        fetchSuppliers(); 
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Supplier Management</h1>
        <div className="flex gap-3 w-full md:w-auto">
          <input 
            type="text" placeholder="Search Supplier..." 
            className="p-3 border rounded-lg flex-1 md:w-72 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-base"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={() => { setIsEditing(false); setFormData({name:'', contactPerson:'', phone:'', address:'', openingBalance:''}); setIsFormModalOpen(true); }} 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition text-base">
            + Add Supplier
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <Table columns={['Business Name', 'Phone', 'Payable Balance', 'Actions']} loading={loading}>
          {filteredSuppliers.map((supplier) => (
            <tr key={supplier._id} className="border-b hover:bg-gray-50 transition">
              <td className="px-6 py-5 font-semibold text-gray-800 text-base">{supplier.name}</td>
              <td className="px-6 py-5 text-gray-600 text-base">{supplier.phone}</td>
              <td className="px-6 py-5 font-bold text-red-600 text-lg">Rs {supplier.currentBalance.toLocaleString()}</td>
              <td className="px-6 py-5 flex gap-3">
                {isAdmin && (
                  <button onClick={() => { 
                    setIsEditing(true); 
                    setSelectedSupplierId(supplier._id); 
                    setFormData({ ...supplier, openingBalance: supplier.initialBalance }); 
                    setIsFormModalOpen(true); 
                  }} 
                    className="text-blue-600 font-bold hover:underline text-base">
                    Edit
                  </button>
                )}
                <button onClick={() => fetchLedger(supplier._id)} 
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg shadow font-bold hover:bg-blue-700 text-sm">
                    View Ledger
                </button>
              </td>
            </tr>
          ))}
          {filteredSuppliers.length === 0 && !loading && (
             <tr><td colSpan="4" className="text-center py-10 text-gray-500 text-lg">No matching suppliers found.</td></tr>
          )}
        </Table>
      </div>

      {/* LEDGER MODAL (Fixed Layout) */}
      <Modal isOpen={isLedgerOpen} onClose={() => setIsLedgerOpen(false)} title={`Ledger: ${selectedSupplier?.name}`} maxWidth="max-w-6xl">
        <div className="flex flex-col h-[80vh]">
            
            {/* Fixed Header: Controls */}
            <div className="flex-none flex flex-col md:flex-row justify-between items-center bg-gray-50 p-4 border-b gap-4">
                <div className="flex gap-3 items-center text-sm font-medium">
                    <span className="text-gray-500">From:</span>
                    <input type="date" value={dateRange.startDate} onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})} className="p-2 border rounded bg-white" />
                    <span className="text-gray-500">To:</span>
                    <input type="date" value={dateRange.endDate} onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})} className="p-2 border rounded bg-white" />
                </div>
                <div className="flex gap-3">
                    <button onClick={() => handlePrintPDF(`/api/suppliers/${selectedSupplier._id}/ledger/pdf?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)} 
                        className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-gray-900 flex items-center gap-2">
                        <span>🖨️</span> Print
                    </button>
                    <button onClick={() => handleViewPDF(`/api/suppliers/${selectedSupplier._id}/ledger/pdf?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)} 
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-purple-700">
                        View PDF
                    </button>
                    {isAdmin && (
                      <button onClick={() => setIsPaymentModalOpen(true)} 
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-green-700">
                        + Payment
                      </button>
                    )}
                </div>
            </div>

            {/* Scrollable Body: Transactions */}
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs uppercase font-bold text-blue-600">Scrap Settlements</p>
                  <p className="text-lg font-black text-blue-900">{scrapSummary.count}</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                  <p className="text-xs uppercase font-bold text-green-600">Deducted From Balance</p>
                  <p className="text-lg font-black text-green-900">Rs {Number(scrapSummary.deductedFromBalance || 0).toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                  <p className="text-xs uppercase font-bold text-orange-600">Payment Received</p>
                  <p className="text-lg font-black text-orange-900">Rs {Number(scrapSummary.paymentReceived || 0).toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs uppercase font-bold text-gray-600">Net Payable Reduction</p>
                  <p className="text-lg font-black text-gray-900">Rs {Number(scrapSummary.netPayableReduction || 0).toLocaleString()}</p>
                </div>
              </div>

                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-100 text-xs font-bold text-gray-600 uppercase sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 border-b">Date</th>
                    <th className="px-6 py-3 border-b">Type</th>
                            <th className="px-6 py-3 border-b">Description</th>
                            <th className="px-6 py-3 border-b text-center">DR (Paid)</th>
                            <th className="px-6 py-3 border-b text-center">CR (Bill)</th>
                            <th className="px-6 py-3 border-b text-right">Balance</th>
                            <th className="px-6 py-3 border-b text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {/* OPENING BALANCE ROW */}
                        <tr className="bg-yellow-50 text-gray-800 font-bold text-sm">
                            <td className="px-6 py-3">{new Date(dateRange.startDate).toLocaleDateString()}</td>
                          <td className="px-6 py-3">OPENING</td>
                          <td className="px-6 py-3" colSpan="3">OPENING BALANCE B/F</td>
                            <td className="px-6 py-3 text-right">{ledgerOpeningBalance.toLocaleString()}</td>
                            <td></td>
                        </tr>

                        {/* TRANSACTIONS */}
                        {ledgerTransactions.map((tx) => (
                            <tr key={tx._id} className="hover:bg-gray-50 transition text-sm">
                                <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${String(tx.type).startsWith('Scrap') ? 'bg-blue-100 text-blue-700' : tx.type === 'Invoice' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                                {tx.type}
                              </span>
                            </td>
                                <td className="px-6 py-4 font-medium text-gray-800">{tx.description}</td>
                                <td className="px-6 py-4 text-green-700 font-bold text-center">{tx.debit > 0 ? tx.debit.toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 text-red-700 font-bold text-center">{tx.credit > 0 ? tx.credit.toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 font-bold text-gray-900 text-right">{tx.balance.toLocaleString()}</td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => handlePrintPDF(tx.type === 'Payment' ? `/api/suppliers/payment/${tx._id}/pdf` : `/api/invoices/${tx.invoiceRef?._id || tx.invoiceRef}/pdf`)} 
                                        className="text-gray-400 hover:text-blue-600 transition text-lg" title="Print Receipt">
                                        🖨️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-8 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">Scrap Settlement Report</h3>
                      <p className="text-xs text-gray-500">Entries where scrap was settled with the supplier, either received or paid.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-gray-50 text-xs font-bold text-gray-600 uppercase">
                        <tr>
                          <th className="px-4 py-3 border-b">Date</th>
                          <th className="px-4 py-3 border-b">Direction</th>
                          <th className="px-4 py-3 border-b">Description</th>
                          <th className="px-4 py-3 border-b text-center">Received</th>
                          <th className="px-4 py-3 border-b text-center">Paid</th>
                          <th className="px-4 py-3 border-b text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scrapSettlements.length > 0 ? scrapSettlements.map((tx) => (
                          <tr key={tx._id} className="border-b hover:bg-gray-50 text-sm">
                            <td className="px-4 py-3 whitespace-nowrap">{new Date(tx.transactionDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold uppercase text-blue-700">{tx.type === 'Scrap Payment Received' ? 'Payment Received' : tx.type === 'Scrap Supplier Payment' ? 'Paid To Supplier' : 'Balance Deduction'}</td>
                            <td className="px-4 py-3 text-gray-700">{tx.description}</td>
                            <td className="px-4 py-3 text-center text-green-700 font-bold">{tx.debit > 0 ? tx.debit.toLocaleString() : '-'}</td>
                            <td className="px-4 py-3 text-center text-orange-700 font-bold">{tx.credit > 0 ? tx.credit.toLocaleString() : '-'}</td>
                            <td className="px-4 py-3 text-right font-bold">{tx.balance.toLocaleString()}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="6" className="px-4 py-8 text-center text-gray-400">No scrap settlements found in this date range.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
            </div>

            {/* Fixed Footer: Closing Balance */}
            <div className="flex-none p-4 bg-gray-100 border-t flex justify-between items-center">
                <span className="text-gray-600 font-bold uppercase tracking-wide">Closing Payable Balance</span>
                <span className="text-xl font-black text-blue-900">Rs {ledgerClosingBalance.toLocaleString()}</span>
            </div>
        </div>
      </Modal>

      {/* FORM MODAL */}
      <Modal isOpen={isFormModalOpen} onClose={() => setIsFormModalOpen(false)} title={isEditing ? "Update Supplier" : "New Supplier"}>
        <form onSubmit={handleFormSubmit} className="space-y-5">
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Business Name</label>
                <input type="text" required className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white transition" 
                    value={formData.name} onChange={(e)=>setFormData({...formData, name:e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Contact Person</label>
                    <input type="text" className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white" 
                        value={formData.contactPerson} onChange={(e)=>setFormData({...formData, contactPerson:e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
                    <input type="text" required className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white" 
                        value={formData.phone} onChange={(e)=>setFormData({...formData, phone:e.target.value})} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Address</label>
                <input type="text" className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white" 
                    value={formData.address} onChange={(e)=>setFormData({...formData, address:e.target.value})} />
            </div>
            
            {/* OPENING BALANCE FIELD */}
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <label className="text-sm font-bold text-yellow-800 block mb-1">
                    {isEditing ? "Edit Opening Balance (Adjusts Ledger)" : "Opening Balance (Optional)"}
                </label>
                <input type="number" placeholder="0" className="w-full p-3 border rounded-lg bg-white" 
                    value={formData.openingBalance} onChange={(e)=>setFormData({...formData, openingBalance:e.target.value})} />
                {isEditing && <p className="text-xs text-yellow-700 mt-1">⚠️ Changing this will update the supplier's entire history balance.</p>}
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={()=>setIsFormModalOpen(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition">
                    {isEditing ? "Update Details" : "Save Supplier"}
                </button>
            </div>
        </form>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Record Payment" maxWidth="max-w-md">
        <form onSubmit={handlePaymentSubmit} className="space-y-5">
            <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-100">
                <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Payee</p>
                <p className="text-xl font-black text-blue-900 uppercase mt-1">{selectedSupplier?.name}</p>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Amount (Rs)</label>
                <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500 font-bold">Rs</span>
                    <input type="number" required className="w-full pl-10 p-3 border-2 border-gray-200 rounded-lg font-bold text-lg focus:border-green-500 outline-none transition"
                        value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                <input type="date" required className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white"
                    value={paymentData.date} onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })} />
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Description / Ref</label>
                <input type="text" required className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white"
                    value={paymentData.description} onChange={(e) => setPaymentData({ ...paymentData, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-bold">Cancel</button>
                <button type="submit" className="px-8 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md transition">Confirm Payment</button>
            </div>
        </form>
      </Modal>
    </div>
  );
};

export default SupplierManagement;