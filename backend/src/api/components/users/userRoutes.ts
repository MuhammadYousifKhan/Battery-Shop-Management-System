import express from 'express';
import { 
    getUsers, 
    createUser, 
    updateUser, 
    deleteUser, 
    toggleUserStatus,
    getUserById // <--- 1. IMPORT THIS
} from './userController'; 

import { protect, admin } from '../../middleware/authMiddleware'; 

const router = express.Router();

router.use(protect); 
router.use(admin);

router.route('/')
    .get(getUsers)
    .post(createUser);

router.route('/:id')
    .get(getUserById) // <--- 2. ADD THIS LINE (The missing piece!)
    .put(updateUser)
    .delete(deleteUser);

router.patch('/:id/status', toggleUserStatus);

export default router;