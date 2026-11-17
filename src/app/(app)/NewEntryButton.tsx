'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';

export default function NewEntryButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const { id } = await api<{ id: number }>('/api/entries', {});
      router.push(`/entry/${id}`);
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button className="primary" onClick={create} disabled={busy}>
      {busy ? '正在打开…' : label}
    </button>
  );
}
