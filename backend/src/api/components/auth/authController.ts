import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../../models/User';

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret";

// @desc    Register a new user
// @route   POST /api/auth/register
export const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { username, password, role, securityQuestion, securityAnswer } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        res.status(409).json({ message: 'Username already exists.' });
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    let hashedAnswer;
    if (securityAnswer) {
        hashedAnswer = await bcrypt.hash(securityAnswer, salt);
    }

    const user = new User({ 
        username, 
        password: hashedPassword, 
        role,
        securityQuestion,
        securityAnswer: hashedAnswer 
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully." });
});

// @desc    Login user & get token
// @route   POST /api/auth/login
export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { username, password, role } = req.body;

    // 1. Check if User Exists
    const user = await User.findOne({ username }).select('+password'); 
    
    if (!user) {
        // 🔴 Fix: Send JSON, don't throw Error
        res.status(404).json({ message: 'Username not found!' });
        return;
    }

    // 2. Check Password
    // @ts-ignore
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        // 🔴 Fix: Send JSON, don't throw Error
        res.status(401).json({ message: 'Incorrect password! Please try again.' });
        return;
    }

    // 3. Check Role
    // @ts-ignore
    if (user.role !== role) {
        // 🔴 Fix: Send JSON, don't throw Error
        res.status(403).json({ 
            message: `Access Denied! This account is not registered as an ${role}.` 
        });
        return;
    }

    // 4. Check Status
    // @ts-ignore
    if (user.status === 'inactive') {
        res.status(401).json({ message: 'Account is inactive.' });
        return;
    }
    
    // 5. Success - Generate Token & Response
    // @ts-ignore
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    
    res.json({ 
        token, 
        _id: user._id, 
        // @ts-ignore
        role: user.role, 
        // @ts-ignore
        username: user.username 
    });
});

// @desc    Get Security Question
// @route   POST /api/auth/forgot-password-question
export const getForgotPasswordQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
        res.status(404).json({ message: 'User not found.' });
        return;
    }

    // @ts-ignore
    if (!user.securityQuestion) {
        res.status(400).json({ message: 'No security question set for this account.' });
        return;
    }

    // @ts-ignore
    res.status(200).json({ securityQuestion: user.securityQuestion });
});

// @desc    Reset Password
// @route   POST /api/auth/reset-password
export const resetPasswordViaQuestion = asyncHandler(async (req: Request, res: Response) => {
    const { username, securityAnswer, newPassword } = req.body;

    const user = await User.findOne({ username }).select('+securityAnswer');

    if (!user) {
        res.status(404).json({ message: 'User not found.' });
        return;
    }

    // @ts-ignore
    const isMatch = await bcrypt.compare(securityAnswer, user.securityAnswer);

    if (!isMatch) {
        res.status(401).json({ message: 'Incorrect security answer.' });
        return;
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.status(200).json({ message: "Password reset successful! Please login with new password." });
});