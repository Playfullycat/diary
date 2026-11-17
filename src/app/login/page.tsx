import { redirect } from 'next/navigation';
import { hasPassword, isAuthed } from '@/lib/auth';
import { passkeyCount } from '@/lib/passkey';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAuthed()) redirect('/');
  return (
    <div className="center-page">
      <div className="card">
        <LoginForm setup={!hasPassword()} passkey={hasPassword() && passkeyCount() > 0} />
      </div>
    </div>
  );
}
