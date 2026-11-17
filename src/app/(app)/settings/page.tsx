import { backupHealth, recentLogs } from '@/lib/backup';
import { levelInfo } from '@/lib/level';
import { listPasskeys } from '@/lib/passkey';
import { publicSettings } from '@/lib/settings';
import SettingsClient from './SettingsClient';

export default function SettingsPage() {
  return (
    <SettingsClient
      initial={publicSettings()}
      level={levelInfo()}
      initialLogs={recentLogs()}
      initialHealth={backupHealth()}
      initialPasskeys={listPasskeys()}
    />
  );
}
