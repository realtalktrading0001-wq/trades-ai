import { useEffect, useState } from 'react';
import { api, type FaqData } from '../api';
import Accordion from '../components/Accordion';
import { SupportIcon } from '../components/Icons';
import { openExternal } from '../telegram';

export default function SupportScreen() {
  const [data, setData] = useState<FaqData | null>(null);

  useEffect(() => {
    api.faq().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="card p-5 text-center bg-gradient-to-br from-electric/15 to-cyan/5 border-cyan/20">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan/15 border border-cyan/30 text-cyan">
          <SupportIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-3 text-lg font-extrabold text-white">How can we help?</h2>
        <p className="mt-1 text-sm text-muted">We usually reply within a few minutes.</p>
        <button
          onClick={() => openExternal(`https://t.me/${data.supportHandle}`)}
          className="btn-primary mt-4 w-full py-3"
        >
          Contact Support on Telegram
        </button>
      </div>

      <div className="space-y-2">
        <div className="label-muted px-1">Frequently asked questions</div>
        {data.faq.map((item) => (
          <Accordion key={item.q} title={item.q}>
            {item.a}
          </Accordion>
        ))}
      </div>
    </div>
  );
}
