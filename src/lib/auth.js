import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
const COOKIE = 'ssf_session';
export async function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }
export async function hashPassword(password) { return bcrypt.hash(password, 10); }
export function createToken(user) { return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, permissions: user.permissions || {} }, process.env.JWT_SECRET, { expiresIn: '12h' }); }
export function setSession(user) { cookies().set(COOKIE, createToken(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }); }
export function clearSession() { cookies().delete(COOKIE); }
export function currentUser() { const token = cookies().get(COOKIE)?.value; if (!token) return null; try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; } }
