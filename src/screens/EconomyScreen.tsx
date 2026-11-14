import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useGame } from '../stores/gameStore';
import { Empty, Panel, Stat } from '../components/ui';
import { pct, num } from '../app/selectors';
import { formatShort, weekToISO } from '../game/engine/dates';

function Chart({ data, lines, domain }: { data: Record<string, number | string>[]; lines: { key: string; name: string; color: string }[]; domain?: [number, number] }) {
  if (data.length < 2) return <Empty>Se requieren algunos meses de historia.</Empty>;
  return (
    <div className="h-56"><ResponsiveContainer><LineChart data={data} margin={{ left: -16, right: 8 }}>
      <CartesianGrid stroke="#DDD6CA" strokeDasharray="3 3" /><XAxis dataKey="fecha" tick={{ fill: '#5C6369', fontSize: 10 }} minTickGap={30} /><YAxis domain={domain ?? ['auto', 'auto']} tick={{ fill: '#5C6369', fontSize: 10 }} />
      <Tooltip contentStyle={{ background: '#FCFAF6', color: '#27313B', border: '1px solid #CEC6B9', borderRadius: 6, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
      {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} dot={false} strokeWidth={2} />)}
    </LineChart></ResponsiveContainer></div>
  );
}

export function EconomyScreen() {
  const { game: g } = useGame();
  if (!g) return null;
  const e = g.economy;
  const data = g.economyHistory.map((h) => ({ fecha: formatShort(weekToISO(g.startDate, h.week)).slice(3), crecimiento: +h.growth.toFixed(2), inflacion: +h.inflation.toFixed(2), desempleo: +h.unemployment.toFixed(2), tpm: h.policyRate, deuda: +h.debt.toFixed(1), cobre: +h.copper.toFixed(2), pobreza: +h.poverty.toFixed(1), aprobacion: +h.approval.toFixed(0) }));
  return (
    <div className="space-y-4">
      <div><div className="eyebrow">Economía nacional</div><h1 className="font-display text-2xl font-bold">Indicadores macroeconómicos</h1></div>
      <Panel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="PIB" value={`${num(e.gdp)} mil MM US$`} />
          <Stat label="Crecimiento" value={pct(e.growth)} tone={e.growth < 0 ? 'bad' : e.growth > 3 ? 'good' : 'neutral'} sub={`potencial ${pct(e.potentialGrowth)}`} />
          <Stat label="Inflación" value={pct(e.inflation)} tone={e.inflation > 4.5 ? 'bad' : 'neutral'} sub={`expectativas ${pct(e.inflationExpect)}`} />
          <Stat label="Desempleo" value={pct(e.unemployment)} tone={e.unemployment > 9 ? 'bad' : 'neutral'} />
          <Stat label="TPM (Banco Central)" value={pct(e.policyRate, 2)} />
          <Stat label="Cobre" value={`${e.copper.toFixed(2).replace('.', ',')} US$/lb`} />
          <Stat label="Tipo de cambio" value={`${num(e.exchangeRate)} $/US$`} />
          <Stat label="Deuda pública" value={pct(e.debt)} sub="del PIB" />
          <Stat label="Balance fiscal" value={pct(e.fiscalBalance)} tone={e.fiscalBalance < -3 ? 'bad' : 'neutral'} sub={`ingresos ${pct(e.revenue)} · gasto ${pct(e.spending)}`} />
          <Stat label="Inversión" value={pct(e.investment)} sub="del PIB" />
          <Stat label="Confianza empresarial" value={Math.round(e.businessConfidence)} />
          <Stat label="Confianza consumidor" value={Math.round(e.consumerConfidence)} />
          <Stat label="Salarios reales" value={e.realWages.toFixed(1).replace('.', ',')} sub="índice 100 = inicio" />
          <Stat label="Pobreza" value={pct(e.poverty)} />
          <Stat label="Desigualdad (Gini)" value={(e.gini / 100).toFixed(3).replace('.', ',')} />
        </div>
        {e.shocks.length > 0 && <p className="mt-3 text-xs text-ink-400">Shocks vigentes: {e.shocks.map((s) => `${s.name} (${s.weeksLeft} sem.)`).join(' · ')}</p>}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Actividad y empleo"><Chart data={data} lines={[{ key: 'crecimiento', name: 'Crecimiento %', color: '#4fbf8a' }, { key: 'desempleo', name: 'Desempleo %', color: '#e06464' }]} /></Panel>
        <Panel title="Precios y Banco Central"><Chart data={data} lines={[{ key: 'inflacion', name: 'Inflación %', color: '#e3b341' }, { key: 'tpm', name: 'TPM %', color: '#5b7bd6' }]} /></Panel>
        <Panel title="Fisco"><Chart data={data} lines={[{ key: 'deuda', name: 'Deuda % PIB', color: '#782F3D' }]} /></Panel>
        <Panel title="Cobre y sociedad"><Chart data={data} lines={[{ key: 'cobre', name: 'Cobre US$/lb', color: '#d97b3f' }, { key: 'pobreza', name: 'Pobreza %', color: '#a78bfa' }]} /></Panel>
      </div>
      <Panel title="Cómo funciona el modelo">
        <p className="text-sm text-ink-300">Modelo macro simplificado mensual: la brecha del producto responde al cobre, al impulso fiscal (con multiplicador mayor cuando hay holguras), a la tasa de política monetaria y a la confianza. El <b>Banco Central es autónomo</b>: fija la TPM con una regla de Taylor suavizada; el Presidente no puede decidirla. Desempleo vía ley de Okun, inflación con expectativas ancladas y traspaso cambiario. Las políticas públicas afectan el crecimiento potencial, la pobreza y la desigualdad con rezagos. Valores iniciales aproximados; ver SIMULATION_RULES.md.</p>
      </Panel>
    </div>
  );
}
