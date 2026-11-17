import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/login');
  return (
    <div className="shell">
      <nav className="nav">
        <Link href="/" className="brand">英语日记</Link>
        <Link href="/" className="link">日记</Link>
        <Link href="/vocab" className="link">生词本</Link>
        <Link href="/phrases" className="link">搭配本</Link>
        <Link href="/study" className="link">复习</Link>
        <Link href="/practice" className="link">练习</Link>
        <Link href="/reading" className="link">阅读</Link>
        <Link href="/mistakes" className="link">错题本</Link>
        <Link href="/progress" className="link">进度</Link>
        <Link href="/settings" className="link">设置</Link>
      </nav>
      {children}
    </div>
  );
}
