import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import User from '../../models/User';
import bcrypt from 'bcryptjs';

// @desc    Get all users (for Admin)
// @route   GET /api/users
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.find({}).select('-password -securityAnswer').sort({ createdAt: -1 });
  res.status(200).json(users);
});

// @desc    Get single user by ID
// @route   GET /api/users/:id
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('-password -securityAnswer');
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Create a new user/manager (by Admin)
// @route   POST /api/users
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role, email, phone, securityQuestion, securityAnswer } = req.body;

  // 1. Check for duplicate Admin
  if (role === 'admin') {
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      res.status(400);
      throw new Error('An admin user already exists. Only one admin is allowed.');
    }
  }

  // 2. Check for duplicate Username
  const userExists = await User.findOne({ username });
  if (userExists) {
    res.status(400);
    throw new Error('Username already exists');
  }

  // 3. Hash Password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // 4. Hash Security Answer (If provided)
  let hashedSecurityAnswer = undefined;
  if (securityAnswer) {
    hashedSecurityAnswer = await bcrypt.hash(securityAnswer, salt);
  }

  // 5. Create User
  const user = new User({
    username,
    password: hashedPassword,
    role,
    email,
    phone,
    status: 'active',
    securityQuestion,             // Optional: Will be stored if provided
    securityAnswer: hashedSecurityAnswer // Optional: Will be stored if provided
  });

  await user.save();
  
  // @ts-ignore
  const createdUser = await User.findById(user._id).select('-password -securityAnswer'); 
  res.status(201).json(createdUser);
});

// @desc    Update User Credentials
// @route   PUT /api/users/:id
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

    if (req.body.username) {
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser && (existingUser._id as any).toString() !== req.params.id) {
      res.status(400);
      throw new Error('Username already taken');
    }
    user.username = req.body.username;
  }

  // Update Password
  if (req.body.password && req.body.password.trim() !== '') {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(req.body.password, salt);
  }

  // Update Security Question/Answer
  if (req.body.securityQuestion) user.securityQuestion = req.body.securityQuestion;
  if (req.body.securityAnswer && req.body.securityAnswer.trim() !== '') {
    const salt = await bcrypt.genSalt(10);
    user.securityAnswer = await bcrypt.hash(req.body.securityAnswer, salt);
  }

  if (req.body.email !== undefined) user.email = req.body.email;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.role) user.role = req.body.role;

    const updatedUser = await user.save();

    res.json({
    _id: updatedUser._id,
    username: updatedUser.username,
    role: updatedUser.role,
    email: updatedUser.email,
    phone: updatedUser.phone,
    status: updatedUser.status,
    securityQuestion: updatedUser.securityQuestion
  });
});

export const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (user) {
    // @ts-ignore
    user.status = user.status === 'active' ? 'inactive' : 'active';
    const updatedUser = await user.save();
    // Convert safely to plain object and remove sensitive fields
    const userToSend: any = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
    if (userToSend) {
      delete userToSend.password;
      delete userToSend.securityAnswer;
    }
    res.status(200).json(userToSend);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);

  if (user) {
    // @ts-ignore
    if (req.user && req.user._id.equals(user._id)) {
      res.status(400);
      throw new Error('You cannot delete your own account.');
    }
    await user.deleteOne(); 
    res.status(200).json({ message: 'User removed' });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});