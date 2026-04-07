import express from 'express';
import { 
    loginUser, 
    registerUser, 
    getForgotPasswordQuestion, 
    resetPasswordViaQuestion 
} from './authController';

const router = express.Router();

router.post('/login', loginUser);

// New Recovery Routes
router.post('/forgot-password-question', getForgotPasswordQuestion);
router.post('/reset-password', resetPasswordViaQuestion);

// UNCOMMENT THIS TEMPORARILY TO REGISTER THE ADMIN
// router.post('/register', registerUser); 

export default router;