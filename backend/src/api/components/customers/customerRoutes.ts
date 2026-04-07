import express from 'express';
import { 
    getCustomers, 
    createCustomer, 
    updateCustomer, 
    deleteCustomer,
    getCustomerById, 
    getPurchasedItems 
} from './customerController';
import { protect, admin } from '../../middleware/authMiddleware'; 

const router = express.Router();

router.route('/')
  .get(protect, getCustomers)
  .post(protect, createCustomer);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, updateCustomer)
  // 🚀 UPDATED: Removed 'admin' middleware so Managers can also delete mistaken customers
  .delete(protect, deleteCustomer); 

// Route for Purchase History
router.route('/:id/purchases')
  .get(protect, getPurchasedItems);

export default router;