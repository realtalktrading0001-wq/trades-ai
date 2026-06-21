import { useApp } from '../state/AppContext';
import { api } from '../api';
import Dropdown from '../components/Dropdown';
import { openExternal } from '../telegram';
import { UserIcon } from '../components/Icons';
import { useT } from '../useT';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex-1 p-4 text-center">
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

export default function ProfileScreen() {
  const { user, config, setUser, logout } = useApp();
  const t = useT();
  if (!user || !config) return null;
  const verified = user.status === 'verified';

  async function save(settings: { timezone?: string; language?: string }) {
    const updated = await api.saveSettings(settings);
    setUser(updated);
  }

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="card p-5 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-electric/30 to-cyan/10 border border-cyan/30 text-cyan">
          <UserIcon className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold text-white truncate">{user.name ?? t('prof.trader')}</div>
          <div className="text-sm text-slate-300">
            {t('prof.poId')}: <span className="font-semibold">{user.pocketOptionId ?? '—'}</span>
          </div>
          <div className={`text-sm font-semibold ${verified ? 'text-success' : 'text-amber'}`}>
            {t('prof.subscription')}: {verified ? t('sub.Active') : t('sub.NotRegistered')}
          </div>
        </div>
      </div>

      {/* Register reminder */}
      {!verified && (
        <div className="card p-5 bg-electric/10 border-electric/30 text-center">
          <p className="text-sm font-semibold text-slate-100">{t('prof.registerToGet')}</p>
          <button
            onClick={() => openExternal(config.pocketOptionRefUrl)}
            className="btn-primary mt-3 w-full py-3"
          >
            {t('prof.registerPO')}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-3">
        <Stat label={t('prof.total')} value={user.stats.total} />
        <Stat label={t('prof.taken')} value={user.stats.taken} />
        <Stat label={t('prof.skipped')} value={user.stats.skipped} />
      </div>

      {/* Settings */}
      <div className="card p-5 space-y-4">
        <div className="text-sm font-bold text-white">{t('prof.settings')}</div>
        <Dropdown
          label={t('prof.timezone')}
          value={user.timezone}
          options={config.timezones}
          onChange={(v) => save({ timezone: v })}
        />
        <Dropdown
          label={t('prof.language')}
          value={user.language}
          options={config.languages}
          onChange={(v) => save({ language: v })}
        />
      </div>

      {/* Account — disconnect the linked PocketOption ID to add a new one */}
      {user.pocketOptionId && (
        <div className="card p-5">
          <button onClick={() => logout()} className="btn-charcoal w-full py-3">
            {t('prof.logout')}
          </button>
          <p className="mt-2 text-center text-xs text-muted">{t('prof.logoutHint')}</p>
        </div>
      )}
    </div>
  );
}
