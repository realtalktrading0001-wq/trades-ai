import { useApp } from '../state/AppContext';
import Accordion from '../components/Accordion';
import { SupportIcon } from '../components/Icons';
import { openExternal } from '../telegram';
import { useT } from '../useT';

const FAQ_KEYS = ['1', '2', '3', '4'];

export default function SupportScreen() {
  const { config } = useApp();
  const t = useT();
  if (!config) return null;

  return (
    <div className="space-y-4">
      <div className="card p-5 text-center bg-gradient-to-br from-electric/15 to-cyan/5 border-cyan/20">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan/15 border border-cyan/30 text-cyan">
          <SupportIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-3 text-lg font-extrabold text-white">{t('sup.help')}</h2>
        <p className="mt-1 text-sm text-muted">{t('sup.reply')}</p>
        <button
          onClick={() => openExternal(`https://t.me/${config.supportHandle}`)}
          className="btn-primary mt-4 w-full py-3"
        >
          {t('sup.contact')}
        </button>
      </div>

      <div className="space-y-2">
        <div className="label-muted px-1">{t('sup.faq')}</div>
        {FAQ_KEYS.map((k) => (
          <Accordion key={k} title={t(`sup.q${k}`)}>
            {t(`sup.a${k}`)}
          </Accordion>
        ))}
      </div>
    </div>
  );
}
