import { currentUser } from '../lib/auth';
import { redirect } from 'next/navigation';
import Dashboard from './ui/Dashboard';
export default function Page() { const user = currentUser(); if (!user) redirect('/login'); return <Dashboard user={user} />; }
