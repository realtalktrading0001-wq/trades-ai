import { useEffect, useState } from 'react';
import { api, type ReferralData } from '../api';
import Countdown from '../components/Countdown';
import Accordion from '../components/Accordion';
import { TrophyIcon, LockIcon, CopyIcon, SendIcon } from '../components/Icons';
import { shareToTelegram } from '../telegram';
import { useT } from '../useT';

export default function ReferralsScreen() {
  const t = useT();
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referrals().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  function copy() {
    navigator.clipboard?.writeText(data!.inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Prize pool */}
      <div className="card p-5 bg-gradient-to-br from-electric/15 to-cyan/5 border-cyan/20 text-center">
        <div className="text-xs font-bold uppercase tracking-widest text-cyan">{t('ref.pool')}</div>
        <div className="mt-1 text-4xl font-black text-white">${data.prizePool}</div>
        <div className="mt-4 flex justify-center">
          <Countdown target={data.endsAt} />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {data.rankPrizes.map((p, i) => (
            <span
              key={i}
              className="rounded-lg bg-midnight-deep/90 border border-white/10 px-2.5 py-1 text-xs font-semibold"
              style={{ color: '#e2e8f0' }}
            >
              #{i + 1} <span className="text-cyan">${p}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Share box */}
      <div className="card p-4">
        <div className="label-muted mb-2">{t('ref.inviteLink')}</div>
        <input readOnly value={data.inviteLink} className="input-dark text-sm text-cyan font-mono" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => shareToTelegram(data.inviteLink, t('ref.shareText'))}
            className="btn py-2.5 bg-teal-500 text-white font-bold hover:brightness-110"
          >
            <SendIcon className="h-4 w-4" /> {t('ref.share')}
          </button>
          <button onClick={copy} className="btn-charcoal py-2.5">
            <CopyIcon className="h-4 w-4" /> {copied ? t('ref.copied') : t('ref.copy')}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex gap-3">
        {[
          [t('ref.invited'), data.invited],
          [t('ref.approved'), data.approved],
          [t('ref.rank'), data.rank ?? '—'],
        ].map(([label, value]) => (
          <div key={label as string} className="card flex-1 p-4 text-center">
            <div className="text-2xl font-extrabold text-white">{value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
          </div>
        ))}
      </div>

      {/* Qualify ribbon */}
      {data.needForPrize > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 text-sm font-medium text-amber">
          <LockIcon className="h-4 w-4 shrink-0" />
          {t('ref.need', { n: data.needForPrize })}
        </div>
      )}

      {/* Leaderboard */}
      <div className="card p-5">
        <div className="text-sm font-bold text-white">{t('ref.leaderboard')}</div>
        {data.leaderboard.length === 0 ? (
          <div className="mt-4 flex flex-col items-center text-center text-muted">
            <TrophyIcon className="h-10 w-10 text-amber" />
            <div className="mt-2 font-semibold text-slate-200">{t('ref.beFirst')}</div>
            <div className="text-sm">{t('ref.climb')}</div>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.leaderboard.map((r) => (
              <li
                key={r.rank}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  r.you ? 'bg-cyan/15 border border-cyan/40' : 'bg-midnight-deep/60 lb-row'
                }`}
              >
                <span className="font-semibold text-slate-100">
                  #{r.rank} {r.name}
                </span>
                <span className="text-muted">
                  {r.approved} {t('ref.invitesShort')} · <span className="text-cyan">${r.prize}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Friends */}
      <Accordion title={`${t('ref.myFriends')} (${data.friends.length})`}>
        {data.friends.length === 0 ? (
          <p className="text-muted">{t('ref.noFriends')}</p>
        ) : (
          <ul className="space-y-2">
            {data.friends.map((f, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>{f.name}</span>
                <span className={f.approved ? 'text-success' : 'text-muted'}>
                  {f.approved ? t('ref.approved') : t('ref.pending')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Accordion>

      {/* Rules */}
      <div className="card p-5">
        <div className="text-sm font-bold text-white">{t('ref.rules')}</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc pl-4">
          <li>{t('ref.rule1')}</li>
          <li>{t('ref.rule2')}</li>
          <li>{t('ref.rule3')}</li>
        </ul>
      </div>
    </div>
  );
}
