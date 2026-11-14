/**
 * DOSSIER TERRITORIAL — cabecera documental de una comuna: fotografía real verificada (de la
 * comuna o, rotulada como tal, de su región), mapa de ubicación, datos oficiales y autoridades.
 * Las autoridades reales se marcan como tales; las ficticias, como personajes de la partida.
 */
import { useGame } from '../stores/gameStore';
import type { GameState, RegionId } from '../game/models/types';
import { COMUNA_BY_CUT } from '../game/territory/data';
import { REGION_BY_ID } from '../game/data/geography';
import { photoFor, photoForComuna } from '../data/media/territorialPhotos';
import { LocatorMap, TerritorialPhoto } from './TerritorialPhoto';
import { PersonName } from './CharacterSheet';
import { PartyChip } from './ui';
import { num, pct, playerChar } from '../app/selectors';
import { homeCut } from '../game/career/capital';

function authorities(g: GameState, cut: number) {
  const c = COMUNA_BY_CUT[cut];
  const rows: { id: string; role: string }[] = [];
  for (const ch of Object.values(g.characters)) {
    if (ch.status !== 'activo') continue;
    for (const o of ch.offices) {
      if (o.type === 'alcalde' && o.comuna === c.name) rows.push({ id: ch.id, role: 'Alcaldía' });
      else if (o.type === 'diputado' && o.districtId === c.district) rows.push({ id: ch.id, role: `Diputación · D${c.district}` });
      else if (o.type === 'senador' && o.regionId === c.region) rows.push({ id: ch.id, role: 'Senado' });
      else if (o.type === 'gobernador' && o.regionId === c.region) rows.push({ id: ch.id, role: 'Gobernación regional' });
    }
  }
  const order = ['Alcaldía', 'Gobernación regional', 'Senado'];
  return rows.sort((a, b) => (order.indexOf(a.role) + 1 || 9) - (order.indexOf(b.role) + 1 || 9));
}

export function TerritorialDossier({ cut }: { cut: number }) {
  const { game: g } = useGame();
  if (!g) return null;
  const c = COMUNA_BY_CUT[cut];
  const region = c.region as RegionId;
  const own = photoForComuna(cut);
  const photo = own ?? photoFor(region);
  const me = playerChar(g);
  const isHome = homeCut(g) === cut;
  const auth = authorities(g, cut);
  return (
    <article className="panel overflow-hidden" aria-labelledby="dossier-title">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_132px]">
        <TerritorialPhoto photo={photo} regionId={region} cut={cut} ratio="16/9" caption={false} className="min-w-0" />
        <div className="hidden border-l border-ink-700 bg-ink-850 p-2 sm:block"><LocatorMap regionId={region} cut={cut} className="h-full w-full" /></div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="kicker">Dossier territorial · {REGION_BY_ID[region].name}</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dossier-title" className="font-display text-[clamp(1.5rem,2.2vw,2rem)] font-semibold leading-tight text-ink-50">{c.name}</h2>
          {isHome && <span className="chip border-burgundy text-burgundy">Tu base</span>}
        </div>
        <p className="text-sm text-ink-300">Provincia de {c.province} · Distrito {c.district} · Circunscripción {REGION_BY_ID[region].shortName}</p>
        {photo && <p className="mt-2 text-[11px] leading-snug text-ink-400">{own ? '' : <><b className="font-medium text-ink-300">Fotografía regional, no de esta comuna:</b> </>}{photo.place} · Foto: {photo.author} · <a className="underline underline-offset-2" href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · <a className="underline underline-offset-2" href={photo.sourceUrl} target="_blank" rel="noreferrer">Wikimedia Commons</a></p>}

        <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-ink-700 pt-3">
          {[
            ['Electores (2023)', num(c.electors)], ['Población (2024)', num(c.pop)], ['Densidad', c.density !== null ? `${num(c.density)}/km²` : '—'],
            ['Escolaridad 18+', `${c.school} años`], ['Educación superior', pct(c.eduSup * 100, 0)], ['Inmigrantes', pct(c.imm * 100, 1)],
            ['Pueblos indígenas', pct(c.indig * 100, 0)], ['Evangélicos', pct(c.evang * 100, 0)], ['Sin religión', pct(c.norel * 100, 0)],
          ].map(([k, v]) => <div key={k}><dt className="text-[11px] text-ink-400">{k}</dt><dd className="font-mono text-[15px] text-ink-50">{v}</dd></div>)}
        </dl>
        <p className="mt-2 text-[11px] text-ink-400">INE Censo 2024 y SERVEL padrón 2023. Los atributos demográficos tienen efectos moderados; no determinan el voto.</p>

        <h3 className="mt-5 eyebrow">Autoridades en la partida</h3>
        {auth.length === 0 ? <p className="mt-1 text-sm text-ink-400">Sin autoridades registradas en la simulación.</p> : (
          <ul className="mt-1 divide-y divide-ink-700 text-sm">
            {auth.map((a) => {
              const ch = g.characters[a.id];
              const rel = me.relations[a.id];
              return (
                <li key={`${a.id}-${a.role}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                  <span className="w-40 shrink-0 text-xs text-ink-400">{a.role}</span>
                  <PersonName id={a.id} className="font-medium text-ink-100" />
                  <PartyChip g={g} id={ch.partyId} />
                  <span className="text-[11px] text-ink-400">{ch.realId ? 'persona real · conducta simulada' : 'personaje ficticio'}</span>
                  {rel !== undefined && <span className={`ml-auto font-mono text-xs ${rel >= 20 ? 'text-emerald-300' : rel <= -20 ? 'text-red-300' : 'text-ink-300'}`}>relación {rel > 0 ? '+' : ''}{Math.round(rel)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
