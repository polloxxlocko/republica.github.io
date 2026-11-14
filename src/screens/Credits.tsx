/**
 * CRÉDITOS — fuentes, autorías y licencias de todo el material de terceros (fotografías, tipografías,
 * geometría y datos). Accesible desde la portada y desde «Partida».
 */
import { ArrowLeft } from 'lucide-react';
import { useGame } from '../stores/gameStore';
import { TERRITORIAL_PHOTOS } from '../data/media/territorialPhotos';
import { REGION_BY_ID } from '../game/data/geography';
import { assetUrl } from '../components/TerritorialPhoto';
import type { RegionId } from '../game/models/types';

const FONTS = [
  { name: 'IBM Plex Sans', use: 'Interfaz y datos', author: 'IBM Corp.', license: 'SIL Open Font License 1.1', url: 'https://github.com/IBM/plex' },
  { name: 'IBM Plex Mono', use: 'Cifras, fechas y códigos', author: 'IBM Corp.', license: 'SIL Open Font License 1.1', url: 'https://github.com/IBM/plex' },
  { name: 'Newsreader', use: 'Titulares y textos editoriales', author: 'Production Type', license: 'SIL Open Font License 1.1', url: 'https://github.com/productiontype/Newsreader' },
];

export function Credits() {
  const { game, setScreen } = useGame();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <button className="btn btn-ghost -ml-3 mb-4" onClick={() => setScreen(game ? 'partida' : 'menu')}><ArrowLeft size={16} aria-hidden /> Volver</button>
      <div className="kicker">Archivo de poder</div>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink-50">Créditos, fuentes y licencias</h1>
      <p className="mt-3 max-w-[68ch] font-serif text-lg text-ink-200">
        Las fotografías territoriales son imágenes reales publicadas en Wikimedia Commons bajo licencias libres verificadas una a una.
        Se muestran redimensionadas y convertidas a WebP; no se modificó su contenido. Donde no hay una fotografía verificada se usa
        una composición cartográfica con la geometría oficial, nunca una imagen de otro lugar.
      </p>

      <section className="mt-10" aria-labelledby="cred-fotos">
        <h2 id="cred-fotos" className="font-display text-2xl font-semibold">Fotografía territorial</h2>
        <div className="rule mt-2" />
        <ul className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
          {TERRITORIAL_PHOTOS.map((p) => (
            <li key={p.id} className="grid grid-cols-[96px_1fr] gap-3">
              <img src={assetUrl(p.fileSmall)} alt="" loading="lazy" decoding="async" width={96} height={64} className="h-16 w-24 rounded-sm object-cover" />
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink-100">{p.place}</div>
                <div className="text-xs text-ink-400">{REGION_BY_ID[p.regionId as RegionId]?.name} · {p.category}</div>
                <div className="mt-0.5 text-xs text-ink-300">
                  Autoría: {p.author} · <a className="underline underline-offset-2 hover:text-gold-400" href={p.licenseUrl} target="_blank" rel="noreferrer">{p.license}</a> · <a className="underline underline-offset-2 hover:text-gold-400" href={p.sourceUrl} target="_blank" rel="noreferrer">archivo original</a>
                </div>
                <div className="truncate font-mono text-[11px] text-ink-400" title={p.source}>{p.source} · consultado {p.downloaded}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-400">Regiones sin fotografía verificada: {(Object.keys(REGION_BY_ID) as RegionId[]).filter((r) => !TERRITORIAL_PHOTOS.some((p) => p.regionId === r)).map((r) => REGION_BY_ID[r].name).join(', ') || 'ninguna'}.</p>
      </section>

      <section className="mt-10" aria-labelledby="cred-tipos">
        <h2 id="cred-tipos" className="font-display text-2xl font-semibold">Tipografías</h2>
        <div className="rule mt-2" />
        <table className="table mt-3">
          <thead><tr><th>Familia</th><th>Uso</th><th>Autoría</th><th>Licencia</th></tr></thead>
          <tbody>{FONTS.map((f) => <tr key={f.name}><td><a className="underline underline-offset-2" href={f.url} target="_blank" rel="noreferrer">{f.name}</a></td><td>{f.use}</td><td>{f.author}</td><td>{f.license}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="mt-10 mb-12" aria-labelledby="cred-datos">
        <h2 id="cred-datos" className="font-display text-2xl font-semibold">Datos y cartografía</h2>
        <div className="rule mt-2" />
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-200">
          <li>Geometría comunal: División Político-Administrativa (MOP / Ministerio de Obras Públicas), simplificada para la web.</li>
          <li>Población: INE, Censo 2024. Padrón electoral y resultados comunales: SERVEL (ver TERRITORY.md para el detalle y la calibración).</li>
          <li>Retratos: siluetas editoriales provisionales (sin rostros de personas reales). El arte definitivo está pendiente; ver docs/CHARACTER_ART_STYLE.md.</li>
        </ul>
      </section>
    </div>
  );
}
