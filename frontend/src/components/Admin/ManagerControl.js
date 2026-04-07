import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/apiClient';
import Table from '../Common/Table';
import Modal from '../Common/Modal';
import { ROLES, STATUS } from '../../Constants';

const ManagerControl = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Form States
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false); // New: Track Edit Mode
    const [editId, setEditId] = useState(null);        // New: Track ID being edited
    
    // --- Password Visibility State ---
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        username: '', password: '', email: '', phone: '', role: ROLES.MANAGER,
    });

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true); 
            try {
                const data = await apiClient.get('/api/users');
                setUsers(data);
            } catch (err) {
                toast.error(err.message);
            } finally { setLoading(false); }
        };
        fetchUsers();
    }, []);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // Open Modal for Creating New
    const handleCreateClick = () => {
        setIsEditing(false);
        setEditId(null);
        setFormData({ username: '', password: '', email: '', phone: '', role: ROLES.MANAGER });
        setShowPassword(false);
        setShowForm(true);
    };

    // Open Modal for Editing Existing
    const handleEditClick = (user) => {
        setIsEditing(true);
        setEditId(user._id);
        // Password blank rakhein, kyunki hum purana password show nahi kar sakte
        setFormData({ 
            username: user.username, 
            password: '',  // Empty means "Don't change"
            email: user.email || '', 
            phone: user.phone || '', 
            role: user.role 
        });
        setShowPassword(false);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.username) { toast.error("Username required."); return; }
        if (!isEditing && !formData.password) { toast.error("Password required for new user."); return; }
        
        const toastId = toast.loading(isEditing ? "Updating User..." : "Creating User...");
        
        try {
            if (isEditing) {
                // --- UPDATE LOGIC ---
                const payload = { ...formData };
                if (!payload.password) delete payload.password; // Agar password khali hai toh mat bhejo

                const updatedUser = await apiClient.put(`/api/users/${editId}`, payload);
                
                // Update local list
                setUsers(prev => prev.map(u => u._id === editId ? { ...u, ...updatedUser } : u));
                toast.success("User Updated!", { id: toastId });
            } else {
                // --- CREATE LOGIC ---
                const data = await apiClient.post('/api/users', formData);
                setUsers(prev => [data, ...prev]); 
                toast.success("User Created!", { id: toastId });
            }

            setShowForm(false);
            setFormData({ username: '', password: '', email: '', phone: '', role: ROLES.MANAGER });
        } catch (err) { toast.error(err.message, { id: toastId }); } 
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        if (!window.confirm(`Confirm toggle status?`)) return;
        const toastId = toast.loading("Updating status...");
        try {
            const updatedUser = await apiClient.patch(`/api/users/${userId}/status`);
            setUsers(prev => prev.map(user => user._id === userId ? updatedUser : user));
            toast.success(`User updated!`, { id: toastId });
        } catch (err) { toast.error(err.message, { id: toastId }); }
    };

    const handleDeleteUser = async (userId, username) => {
        if (!window.confirm(`Delete user '${username}'?`)) return;
        const toastId = toast.loading("Deleting user...");
        try {
            await apiClient.delete(`/api/users/${userId}`);
            setUsers(prevUsers => prevUsers.filter(user => user._id !== userId));
            toast.success("User deleted!", { id: toastId });
        } catch (err) { toast.error(err.message, { id: toastId }); }
    };

    return (
        <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Manager Control</h1>
                <button onClick={handleCreateClick} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
                    + Add New User
                </button>
            </div>

            <Table 
                columns={['Username', 'Role', 'Email', 'Phone', 'Status', 'Actions']}
                loading={loading}
            >
                {users.map(user => (
                    <tr key={user._id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap uppercase text-xs font-bold text-gray-500">{user.role}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{user.email || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{user.phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs rounded-full ${user.status === STATUS.ACTIVE ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.status}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button onClick={() => handleEditClick(user)} className="text-blue-600 hover:underline mr-4">
                                Edit
                            </button>
                            <button onClick={() => handleToggleStatus(user._id, user.status)} className="text-gray-600 hover:text-gray-900 mr-4">
                                {user.status === STATUS.ACTIVE ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => handleDeleteUser(user._id, user.username)} className="text-red-600 hover:text-red-900">Delete</button>
                        </td>
                    </tr>
                ))}
            </Table>

            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={isEditing ? "Edit User Credentials" : "Add New User"}>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Username</label>
                            <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full p-3 border rounded mt-1" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                {isEditing ? "New Password (Leave blank to keep same)" : "Password"}
                            </label>
                            <div className="relative mt-1">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    name="password" 
                                    value={formData.password} 
                                    onChange={handleChange} 
                                    required={!isEditing} 
                                    placeholder={isEditing ? "Enter only if changing" : ""}
                                    className="w-full p-3 pr-10 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
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
                        <div><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-3 border rounded mt-1" /></div>
                        <div><label className="block text-sm font-medium text-gray-700">Phone</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full p-3 border rounded mt-1" /></div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Role</label>
                            <select name="role" value={formData.role} onChange={handleChange} className="w-full p-3 border rounded mt-1 bg-white">
                                <option value={ROLES.MANAGER}>Manager</option>
                                <option value={ROLES.ADMIN}>Admin</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {loading ? "Saving..." : (isEditing ? "Update User" : "Create User")}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ManagerControl;