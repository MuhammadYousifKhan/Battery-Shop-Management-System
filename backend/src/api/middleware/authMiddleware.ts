// src/api/middleware/authMiddleware.ts (FIXED: Will not crash server)
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User, { IUser } from '../models/User';

// TypeScript ke Request object ko extend karein
declare global {
  namespace Express {
    interface Request {
      user?: IUser; 
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret";

// Check karta hai ke user Logged In hai
export const protect = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      try {
        token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user || (req.user as any).status === 'inactive') {
            res.status(401);
            // --- FIX 1 ---
            // Pehle: throw new Error(...)
            // Ab: Sirf response bhejien
            res.json({ message: 'Not authorized, user inactive or not found' });
            return;
        }
        next();
      } catch (error) {
        res.status(401);
        // --- FIX 2 ---
        // Pehle: throw new Error(...)
        // Ab: Sirf response bhejien
        res.json({ message: 'Not authorized, token failed' });
        return;
      }
    }
    if (!token) {
      res.status(401);
      // --- FIX 3 ---
      // Pehle: throw new Error(...)
      // Ab: Sirf response bhejien
      res.json({ message: 'Not authorized, no token' });
      return;
    }
  }
);

// Check karta hai ke user Admin hai
export const admin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    next(); 
  } else {
    res.status(403); // Forbidden
    // --- FIX 4 ---
    // Pehle: throw new Error(...)
    // Ab: Sirf response bhejien
    res.json({ message: 'Not authorized as an admin' });
    return;
  }
};

// Check karta hai ke user Admin ya Manager hai
export const adminOrManager = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
    next();
  } else {
    res.status(403);
    res.json({ message: 'Not authorized for this action' });
    return;
  }
};