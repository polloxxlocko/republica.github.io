/**
 * CONVERSACIONES — «Archivo de Poder». Invitaciones, conversación en curso (retrato, contexto,
 * transcripción y opciones), compromisos, relaciones narradas sin números e historial. La interfaz solo
 * despacha acciones: el motor de diálogo decide reacciones y consecuencias.
 */
import { useMemo, useState } from 'react';
import { CalendarClock, Handshake, MessageCircle, Users } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import type { GameState } from '../game/models/types';
import type { DialogueSession } from '../game/dialogue/types';
import { optionsOf, playerStarts } from '../game/dialogue/engine';
import { DEF_BY_ID } from '../game/dialogue/definitions';
import { describe as describeRel } from '../game/dialogue/relations';
import { memoriesOf } from '../game/dialogue/memory';
import { render } from '../game/dialogue/text';
import { ctxOf } from '../game/dialogue/engine';
import { contradictions } from '../game/dialogue/positions';
import { Rng } from '../game/engine/rng';
import { Badge, Empty, Portrait, Tabs } from '../components/ui';
import { partyColor, partyShort, officeText } from '../app/selectors';
import { formatShort, weekToISO } from '../game/engine/dates';

type Tab = 'agenda' | 'compromisos' | 'relaciones' | 'historial';
const wk = (g: GameState, w: number) => formatShort(weekToISO(g.startDate, w));
const name = (g: GameState, id: string) => { const c = g.characters[id]; return c ? `${c.firstName} ${c.lastName}` : id; };
const FICTION = 'Conversación ficticia: los diálogos con personas reales son simulados por el juego y no reproducen dichos reales. Los estilos de negociación son perfiles del juego.';
const STATUS_LABEL: Record<string, string> = { vigente: 'vigente', cumplido: 'cumplido', incumplido: 'incumplido', renegociado: 'renegociado', imposible: 'imposible de cumplir', terminado: 'terminado' };
const STATUS_TONE: Record<string, 'neutral' | 'good' | 'bad' | 'warn' | 'gold'> = { vigente: 'gold', cumplido: 'good', incumplido: 'bad', renegociado: 'warn', imposible: 'neutral', terminado: 'neutral' };

function Person({ g, id, size = 56 }: { g: GameState; id: string; size?: number }) {
  const c = g.characters[id]; const { openSheet } = useGame();
  if (!c) return null;
  return (
    <button className="flex items-center gap-3 text-left" onClick={() => openSheet(id)}>
      <Portrait name={name(g, id)} color={partyColor(g, c.partyId)} seed={id} size={size} />
      <span>
        <span className="block font-display text-lg font-semibold text-ink-50">{name(g, id)}{c.realId && <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wide text-ink-400">persona real</span>}</span>
        <span className="block text-xs text-ink-300">{officeText(g, c)} · {partyShort(g, c.partyId)}</span>
      </span>
    </button>
  );
}

function ActiveSession({ g, sess }: { g: GameState; sess: DialogueSession }) {
  const { act } = useGame();
  const d = DEF_BY_ID[sess.defId];
  const opts = optionsOf(g, new Rng(g.rng), sess);
  const c = ctxOf(g, new Rng(g.rng), sess);
  const me = g.player.characterId;
  return (
    <article className="panel overflow-hidden" aria-label="Conversación en curso">
      <header className="border-b border-ink-600 bg-ink-800 px-5 py-4">
        <div className="kicker">{d.title} · {wk(g, sess.week)} · {sess.place}</div>
        <div className="mt-3 flex flex-wrap gap-4">{sess.participants.slice(0, 4).map((p) => <Person key={p} g={g} id={p} size={sess.participants.length > 1 ? 40 : 56} />)}</div>
        <p className="mt-3 font-serif text-[15px] text-ink-200">{sess.motive}</p>
        {sess.participants.length === 1 && <p className="mt-1 text-xs text-ink-400">Cómo te ve: {describeRel(g, sess.participants[0], me).join(' · ')}</p>}
        {sess.fiction && <p role="note" className="mt-2 border-l-2 border-burgundy pl-2 text-xs text-ink-200">{FICTION}</p>}
      </header>
      <div className="space-y-3 px-5 py-4">
        {sess.transcript.map((l, i) => l.kind === 'narracion' || l.speaker === 'narrador'
          ? <p key={i} className="text-sm italic text-ink-300">{l.text}</p>
          : l.speaker === me
            ? <p key={i} className="ml-auto max-w-[85%] rounded border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-50"><span className="eyebrow block">Tú</span>{l.text}</p>
            : <p key={i} className="max-w-[85%] font-serif text-[16px] text-ink-50"><span className="eyebrow block">{name(g, l.speaker)}</span>«{l.text}»</p>)}
        {sess.reactions.length > 0 && <ul className="border-t border-ink-700 pt-2 text-xs text-ink-300">{sess.reactions.slice(-4).map((r, i) => <li key={i}>· {r}</li>)}</ul>}
      </div>
      <footer className="border-t border-ink-600 px-5 py-4">
        <div className="eyebrow mb-2">Qué dices ({sess.exchanges}/{sess.maxExchanges})</div>
        <div className="grid gap-2">
          {opts.map((o) => <button key={o.id} className="btn justify-start text-left" onClick={() => act({ type: 'conv_responder', sessionId: sess.id, optionId: o.id })}>{render(o.text, c)}</button>)}
          {!opts.length && <Empty>No quedan respuestas disponibles.</Empty>}
        </div>
      </footer>
    </article>
  );
}

function Agenda({ g }: { g: GameState }) {
  const { act } = useGame();
  const st = g.dialogue!;
  const pending = st.invitations.filter((i) => i.status === 'pendiente');
  const starts = useMemo(() => playerStarts(g), [g]);
  const info = st.info.slice(-5).reverse();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel p-4">
        <h2 className="eyebrow mb-3 flex items-center gap-2"><CalendarClock size={14} aria-hidden /> Te buscan</h2>
        {pending.length === 0 ? <Empty>Nadie ha pedido reunirse contigo por ahora.</Empty> : pending.map((i) => (
          <div key={i.id} className="mb-3 border-b border-ink-700 pb-3 last:border-0">
            <Person g={g} id={i.fromId} size={40} />
            <p className="mt-2 text-sm text-ink-100">{i.motive}</p>
            {i.detail && <p className="mt-1 text-xs text-ink-300">{i.detail}</p>}
            <p className="mt-1 text-[11px] text-ink-400">Vence {wk(g, i.expiresWeek)}{DEF_BY_ID[i.defId]?.kind !== 'breve' ? ' · requiere 1 PA' : ''}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => act({ type: 'conv_invitacion', inviteId: i.id, decision: 'aceptar' })}>Aceptar</button>
              {!i.detail && <button className="btn" onClick={() => act({ type: 'conv_invitacion', inviteId: i.id, decision: 'consultar' })}>Preguntar el motivo</button>}
              {!i.rescheduled && <button className="btn" onClick={() => act({ type: 'conv_invitacion', inviteId: i.id, decision: 'reprogramar' })}>Reprogramar</button>}
              <button className="btn" onClick={() => act({ type: 'conv_invitacion', inviteId: i.id, decision: 'rechazar' })}>Declinar</button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel p-4">
        <h2 className="eyebrow mb-3 flex items-center gap-2"><MessageCircle size={14} aria-hidden /> Pedir una reunión</h2>
        {starts.length === 0 ? <Empty>En tu posición actual no hay conversaciones que puedas convocar. Cambian con tu cargo, tu partido y lo que ocurre en el mundo.</Empty> : (
          <ul className="space-y-2">{starts.map((x, k) => (
            <li key={k} className="flex items-center justify-between gap-3 text-sm">
              <span><span className="text-ink-50">{x.label}</span>{x.blocked && <span className="block text-xs text-ink-400">{x.blocked}</span>}</span>
              <button className="btn shrink-0" disabled={!!x.blocked} onClick={() => act({ type: 'conv_iniciar', defId: x.defId, args: x.args })}>{x.kind === 'breve' ? 'Conversar' : 'Convocar (1 PA)'}</button>
            </li>))}
          </ul>)}
      </section>
      {info.length > 0 && <section className="panel p-4 lg:col-span-2">
        <h2 className="eyebrow mb-2">Lo que has escuchado</h2>
        <ul className="space-y-1 text-sm">{info.map((i) => <li key={i.id} className="text-ink-200"><Badge tone={i.kind === 'rumor' ? 'warn' : 'neutral'}>{i.kind === 'rumor' ? 'rumor no confirmado' : i.kind}</Badge> {i.text} <span className="text-[11px] text-ink-400">— {name(g, i.source)}, {wk(g, i.week)}</span></li>)}</ul>
      </section>}
    </div>
  );
}

function Commitments({ g }: { g: GameState }) {
  const me = g.player.characterId;
  const list = [...g.dialogue!.commitments].reverse();
  const contra = contradictions(g);
  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="eyebrow mb-3 flex items-center gap-2"><Handshake size={14} aria-hidden /> Palabra empeñada</h2>
        {list.length === 0 ? <Empty>Aún no has asumido compromisos políticos.</Empty> : (
          <ul className="divide-y divide-ink-700">{list.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge><span className="text-ink-50">{c.content}</span></div>
              <div className="mt-0.5 text-xs text-ink-400">{c.debtor === me ? `Tu compromiso con ${name(g, c.creditor)}` : `${name(g, c.debtor)} se comprometió contigo`} · {wk(g, c.createdWeek)}{c.note ? ` · ${c.note}` : ''}{c.breach === 'deliberado' ? ' · lo recordará' : ''}</div>
            </li>))}
          </ul>)}
      </section>
      {contra.length > 0 && <section className="panel p-4">
        <h2 className="eyebrow mb-2">Cambios de postura que la prensa puede notar</h2>
        <ul className="space-y-1 text-sm text-ink-200">{contra.map((c, i) => <li key={i}>Sobre {c.label}: {c.before.source} ({wk(g, c.before.week)}) {c.before.stance > 0 ? 'a favor' : 'en contra'}; luego {c.after.source} ({wk(g, c.after.week)}) {c.after.stance > 0 ? 'a favor' : 'en contra'}.</li>)}</ul>
      </section>}
    </div>
  );
}

function Relations({ g }: { g: GameState }) {
  const me = g.player.characterId;
  const ids = Object.values(g.dialogue!.rel).filter((r) => r.to === me && g.characters[r.from]).sort((a, b) => b.lastWeek - a.lastWeek).slice(0, 24).map((r) => r.from);
  if (!ids.length) return <Empty>Todavía no has conversado con nadie.</Empty>;
  return (
    <div className="grid gap-3 md:grid-cols-2">{ids.map((id) => {
      const mems = memoriesOf(g, id, me).filter((m) => m.kind !== 'consolidado').slice(0, 3);
      return (
        <article key={id} className="panel p-4">
          <Person g={g} id={id} size={44} />
          <p className="mt-2 text-sm text-ink-100">{describeRel(g, id, me).join(' · ')}</p>
          {mems.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-ink-300">{mems.map((m) => <li key={m.id}>Recuerda: {m.summary} <span className="text-ink-400">({wk(g, m.week)})</span></li>)}</ul>}
        </article>);
    })}</div>
  );
}

function History({ g }: { g: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  const done = g.dialogue!.sessions.filter((x) => x.status === 'cerrada').slice().reverse();
  if (!done.length) return <Empty>Sin conversaciones registradas.</Empty>;
  return (
    <ul className="panel divide-y divide-ink-700">{done.map((x) => (
      <li key={x.id} className="px-4 py-2 text-sm">
        <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
          <span className="text-ink-50">{DEF_BY_ID[x.defId]?.title} · {x.participants.slice(0, 3).map((p) => name(g, p)).join(', ')}{x.participants.length > 3 ? '…' : ''}</span>
          <span className="text-xs text-ink-400">{wk(g, x.week)} · {x.outcome}</span>
        </button>
        {open === x.id && <div className="mt-2 space-y-1 border-l border-ink-600 pl-3 text-xs text-ink-200">
          {x.fiction && <p className="text-ink-400">{FICTION}</p>}
          {x.transcript.map((l, i) => <p key={i}><b>{l.speaker === g.player.characterId ? 'Tú' : l.speaker === 'narrador' ? '' : name(g, l.speaker)}</b>{l.speaker === 'narrador' ? <i>{l.text}</i> : `: ${l.text}`}</p>)}
          {x.reactions.length > 0 && <p className="text-ink-400">Consecuencias: {x.reactions.join(' ')}</p>}
        </div>}
      </li>))}
    </ul>
  );
}

export function ConversationsScreen() {
  const { game: g } = useGame();
  const [tab, setTab] = useState<Tab>('agenda');
  if (!g?.dialogue) return <Empty>Sistema de conversaciones no disponible en esta partida.</Empty>;
  const active = g.dialogue.sessions.find((x) => x.status === 'activa');
  const pend = g.dialogue.invitations.filter((i) => i.status === 'pendiente').length;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <div className="kicker flex items-center gap-2"><Users size={14} aria-hidden /> Archivo de Poder</div>
        <h1 className="font-display text-3xl font-semibold text-ink-50">Conversaciones</h1>
        <p className="text-sm text-ink-300">Lo que dices se recuerda. Los compromisos se verifican con lo que haces después.</p>
      </header>
      {active && <ActiveSession g={g} sess={active} />}
      <Tabs value={tab} onChange={setTab} options={[{ id: 'agenda', label: `Agenda${pend ? ` (${pend})` : ''}` }, { id: 'compromisos', label: 'Compromisos' }, { id: 'relaciones', label: 'Relaciones' }, { id: 'historial', label: 'Historial' }]} />
      {tab === 'agenda' && <Agenda g={g} />}
      {tab === 'compromisos' && <Commitments g={g} />}
      {tab === 'relaciones' && <Relations g={g} />}
      {tab === 'historial' && <History g={g} />}
    </div>
  );
}
