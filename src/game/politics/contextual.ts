/**
 * ACCIONES CONTEXTUALES: sustituyen a las acciones genéricas («Reunirse con un actor», «Construir
 * redes», «Asistir a una asamblea», «Organizar un acto», «Recaudar», «Estudiar»…). Cada semana se
 * ofrecen unas pocas situaciones concretas, con objetivo, personas, territorio, duración, recursos,
 * obstáculos y resultados posibles. El resultado depende de la disponibilidad, los objetivos y la
 * historia compartida; una misma categoría (p. ej. «pedir una reunión») cambia de significado según si
 * nunca se conocieron, si fue tu mentor/a, si compitieron, si le debes algo o si acaba de asumir.
 */
import type { Character } from '../models/types';
import type { ContextOffer, ContextTask, Ctx, W } from './types';
import { AREA_LABELS } from '../rules/params';
import {
  P, me, party, home, comuna, name, firstN, ch, has, isLeg, infl, disp, relOf, chance, skill, rel, mem, rep, regRep, land, org, funds, feed, invite, newPid, localFigure, contacts, discontent, rejection, follow,
} from './ops';
import { goalsOf } from '../dialogue/goals';
import { homeArea, problemOf, neighbor, leaderOf } from './library/common';
import { capitalOf } from '../career/capital';
import { clamp } from '../rules/params';

type Variant = 'desconocido' | 'mentor' | 'rival' | 'deuda' | 'coaspirante' | 'nuevo_presidente' | 'conocido';
/** Variante de una reunión según la historia compartida y el momento político. */
export function meetingVariant(w: W, c: Character): Variant {
  const pid = me(w).id; const r = relOf(w, c.id); const st = w.s.dialogue;
  const p = party(w);
  const leadSince = c.offices.find((o) => o.type === 'presidente_partido')?.since;
  if (p?.leaderId === c.id && leadSince !== undefined && w.s.week - leadSince < 10) return 'nuevo_presidente';
  if (st?.commitments.some((x) => x.debtor === pid && x.creditor === c.id && x.status === 'vigente')) return 'deuda';
  if (st?.commitments.some((x) => x.kind === 'lealtad' && x.debtor === pid && x.creditor === c.id) || (r.respect > 25 && r.dependence > 8)) return 'mentor';
  if (r.rivalry > 25 || st?.memories.some((m) => m.owner === c.id && m.about === pid && (m.kind === 'disputa_electoral' || m.kind === 'conflicto'))) return 'rival';
  const sameProc = w.s.career.processes.some((x) => x.status !== 'resuelto' && x.aspirants.some((a) => a.charId === pid) && x.aspirants.some((a) => a.charId === c.id && a.status !== 'retirado'));
  if (sameProc || (c.ambitionTarget === me(w).ambitionTarget && c.offices.length === 0 && c.regionId === me(w).regionId && goalsOf(w.s, c).some((g) => g.kind === 'candidatura'))) return 'coaspirante';
  if (r.familiarity < 12) return 'desconocido';
  return 'conocido';
}

const roleOf = (w: W, c: Character) => { const o = c.offices.find((x) => x.type !== 'militante'); return o ? (o.label ?? o.type) : c.partyId === me(w).partyId ? `militante de ${party(w)?.short}` : 'dirigente'; };

interface Tpl { id: string; replaces: string; build: (w: W) => Omit<ContextOffer, 'id' | 'week' | 'tpl'> | null; resolve: (w: W, t: ContextTask) => string }

const TPLS: Tpl[] = [
  { id: 'reunion', replaces: 'Reunirse con un actor / Mejorar relaciones',
    build: (w) => {
      const pool: Character[] = [];
      const lf = localFigure(w); if (lf) pool.push(lf);
      const l = leaderOf(w); if (l && !l.realId) pool.push(l);
      pool.push(...contacts(w, (c) => !c.realId && (relOf(w, c.id).rivalry > 25 || relOf(w, c.id).respect > 20)).slice(0, 4));
      for (const cm of w.s.dialogue?.commitments ?? []) if (cm.debtor === me(w).id && cm.status === 'vigente' && ch(w, cm.creditor)?.status === 'activo' && !ch(w, cm.creditor)?.realId) pool.push(ch(w, cm.creditor)!);
      const cands = pool.filter((c, i) => pool.indexOf(c) === i && (P(w).cooldowns[`ctx|reunion|${c.id}`] ?? -1) <= w.s.week);
      if (!cands.length) return null;
      const c = cands[w.rng.int(0, cands.length - 1)]; const v = meetingVariant(w, c); const role = roleOf(w, c);
      const p = party(w); const interna = p ? `la próxima elección interna (en ${Math.max(0, p.nextLeadershipWeek - w.s.week)} semanas)` : 'tu próximo paso';
      const debt = w.s.dialogue?.commitments.find((x) => x.debtor === me(w).id && x.creditor === c.id && x.status === 'vigente');
      const T: Record<Variant, { title: string; objective: string; obstacles: string[]; outcomes: string[] }> = {
        desconocido: { title: `Pedir una reunión con ${name(w, c.id)} (${role})`, objective: `Presentarte y discutir tu participación en ${interna}`, obstacles: ['No te conoce', c.offices.length ? 'Tiene la agenda llena' : 'Puede no responder'], outcomes: ['Te recibe y te toma en cuenta', 'Te deriva a alguien de su equipo', 'No responde'] },
        mentor: { title: `Consultar a ${name(w, c.id)} sobre tu próximo paso`, objective: 'Pedir consejo y, si se puede, su respaldo para tu ambición', obstacles: ['Puede ver tu ambición como competencia propia'], outcomes: ['Te da una lectura útil y su respaldo', 'Te aconseja esperar', 'Se incomoda si aspiras a lo mismo que él/ella'] },
        rival: { title: `Proponer a ${name(w, c.id)} una conversación para bajar la tensión`, objective: 'Evitar que la rivalidad siga creciendo', obstacles: ['Desconfía de ti', 'Puede usar la reunión en tu contra'], outcomes: ['Acepta una conversación de reconciliación', 'Escucha sin cambiar nada', 'Rechaza y lo comenta'] },
        deuda: { title: `Reunirte con ${name(w, c.id)} para hablar de lo que acordaron`, objective: `Rendir cuentas de: ${debt?.content ?? 'tu compromiso'}`, obstacles: ['Espera resultados, no explicaciones'], outcomes: ['Reafirma la confianza', 'Acepta renegociar el compromiso', 'Queda con molestia'] },
        coaspirante: { title: `Explorar con ${name(w, c.id)} un acuerdo antes de competir`, objective: 'Evitar desgastarse en una competencia por el mismo espacio', obstacles: ['Quiere lo mismo que tú', 'Puede filtrar la conversación'], outcomes: ['Pacto: uno se retira a cambio de algo', 'Acuerdo de competir con reglas', 'Choque abierto'] },
        nuevo_presidente: { title: `Presentarte ante ${name(w, c.id)}, que acaba de asumir la presidencia del partido`, objective: 'Ofrecer tu trabajo y ubicarte en la nueva conducción', obstacles: ['Todos están pidiendo lo mismo', relOf(w, c.id).rivalry > 15 ? 'Tuvieron diferencias' : 'No sabe quién eres'], outcomes: ['Te incluye en un equipo', 'Te agradece sin compromisos', 'Te deja fuera'] },
        conocido: { title: `Reunión de trabajo con ${name(w, c.id)}`, objective: `Coordinar ${p ? `el trabajo de ${p.short} en ${comuna(home(w))}` : 'un trabajo común en el territorio'}`, obstacles: ['Sus propias prioridades'], outcomes: ['Acuerdan una tarea concreta', 'Reunión cordial sin compromisos'] },
      };
      const t = T[v];
      return { variant: v, title: t.title, objective: t.objective, persons: [c.id], weeks: 1, cost: 1, funds: 0, obstacles: t.obstacles, outcomes: t.outcomes, ctx: { npc: c.id, commitment: debt?.id ?? '' } };
    },
    resolve: (w, t) => {
      const id = String(t.ctx.npc); const c = ch(w, id); if (!c || c.status !== 'activo') return 'La reunión no se concretó.';
      P(w).cooldowns[`ctx|reunion|${id}`] = w.s.week + 8;
      // disponibilidad: cargos altos y poca disposición hacen difícil conseguir la reunión
      const busy = c.offices.some((o) => ['diputado', 'senador', 'presidente_partido', 'gobernador', 'alcalde'].includes(o.type)) ? 0.35 : 0.1;
      const d = disp(w, id) + w.rng.normal(0, 10);
      if (t.variant !== 'deuda' && d < -20 && chance(w, 0.6)) { rel(w, id, { willingness: -1 }, 'menor'); return `${name(w, id)} no responde tu solicitud.`; }
      if (t.variant === 'desconocido' && chance(w, busy)) { rel(w, id, { familiarity: 4 }, 'menor'); return `Te recibe alguien del equipo de ${name(w, id)}: tomaron nota, nada más.`; }
      switch (t.variant) {
        case 'desconocido': { rel(w, id, { familiarity: 14, respect: d > 5 ? 4 : 0 }); if (d > 5) { w.s.dialogue?.info.push({ id: `inf${w.s.week}${id}`, week: w.s.week, source: id, text: `${name(w, id)} cree que en la interna pesarán las comunas con militancia activa y que «hay espacio para gente nueva».`, kind: 'opinion', confirmed: false }); return `${name(w, id)} te recibe y te toma en cuenta: te pide que la comunal se active en tu sector.`; } return `${name(w, id)} te escucha con cortesía, sin comprometer nada.`; }
        case 'mentor': { const competes = c.ambitionTarget === me(w).ambitionTarget && c.offices.length <= me(w).offices.length; if (competes) { rel(w, id, { rivalry: 6, trust: -3 }); return `${firstN(w, id)} se incomoda: aspira a lo mismo que tú. «Todavía no es tu momento».`; } rel(w, id, { trust: 4, cooperation: 3 }); if (d > 10) { w.s.dialogue?.commitments.push({ id: newPid(w.s, 'pc'), debtor: id, creditor: me(w).id, kind: 'apoyo_aspiracion', content: `${name(w, id)} respaldará tu próxima aspiración`, createdWeek: w.s.week, dueWeek: w.s.week + 100, conditions: {}, status: 'vigente', visibility: 'privado', importance: 'compromiso' }); return `${firstN(w, id)} te da su respaldo para tu próxima aspiración. Habrá que ver si lo cumple.`; } return `${firstN(w, id)} te aconseja construir más base antes de dar el paso.`; }
        case 'rival': { if (d > -10) { invite(w, id, 'reconciliacion', { target: id }, `${name(w, id)} acepta conversar para recomponer la relación.`); rel(w, id, { rivalry: -4 }, 'menor'); return `${firstN(w, id)} acepta conversar (revisa Conversaciones).`; } rel(w, id, { rivalry: 4 }, 'menor'); feed(w, id, 'conflicto', `${name(w, id)} comenta que «le pidieron una tregua».`); return `${firstN(w, id)} rechaza y lo comenta en la comunal.`; }
        case 'deuda': { const cm = w.s.dialogue?.commitments.find((x) => x.id === t.ctx.commitment); if (!cm || cm.status !== 'vigente') return 'El compromiso ya no está vigente.'; if (d > 0) { rel(w, id, { trust: 4, reliability: 3 }); return `${firstN(w, id)} valora que des la cara: la confianza se mantiene.`; } cm.status = 'renegociado'; cm.resolvedWeek = w.s.week; rel(w, id, { reliability: -3 }, 'menor'); return `${firstN(w, id)} acepta renegociar el compromiso, sin entusiasmo.`; }
        case 'coaspirante': { const mine = infl(w) + capitalOf(w.s).territorial * 0.4; const theirs = infl(w, c) + c.rep.reconocimiento * 0.3; if (d > 10 && Math.abs(mine - theirs) > 15) { const weaker = mine > theirs ? id : me(w).id; if (weaker === id) { feed(w, id, 'retiro', `${name(w, id)} se baja y te respalda.`); rel(w, id, { cooperation: 8, rivalry: -10 }); for (const p of w.s.career.processes) for (const a of p.aspirants) if (a.charId === id && a.status !== 'retirado') a.status = 'retirado'; return `${firstN(w, id)} acepta bajarse a cambio de tu apoyo futuro. Quedas como opción del sector.`; } return `${firstN(w, id)} te propone que tú te bajes: «yo tengo más opciones». Lo dejas pendiente.`; } if (d > -10) { rel(w, id, { respect: 4 }); return 'Acuerdan competir con reglas: nada de ataques personales.'; } rel(w, id, { rivalry: 10 }); return 'La conversación termina mal: la competencia será dura.'; }
        case 'nuevo_presidente': { if (d > 0) { rel(w, id, { cooperation: 8 }); rep(w, 'confianzaPartido', 3); org(w, 1); return `${firstN(w, id)} te incluye en un equipo de trabajo de la nueva directiva.`; } if (d > -15) return `${firstN(w, id)} te agradece, sin compromisos.`; rel(w, id, { rivalry: 3 }, 'menor'); return `${firstN(w, id)} deja claro que no cuenta contigo.`; }
        default: { rel(w, id, { cooperation: 5, familiarity: 6 }); org(w, 0.6); return `Acuerdan una tarea concreta con ${firstN(w, id)}.`; }
      }
    } },
  { id: 'presentacion', replaces: 'Buscar contactos',
    build: (w) => {
      const bridge = contacts(w, (c) => relOf(w, c.id).trust > 10 && !c.realId)[0]; if (!bridge) return null;
      const target = Object.values(w.s.characters).find((c) => c.status === 'activo' && !c.isPlayer && !c.realId && c.id !== bridge.id && (bridge.relations[c.id] ?? 0) > 10 && relOf(w, c.id).familiarity < 10 && infl(w, c) > infl(w));
      if (!target) return null;
      return { variant: 'puente', title: `Pedir a ${name(w, bridge.id)} que te presente a ${name(w, target.id)}`, objective: `Abrir un canal con ${name(w, target.id)} (${roleOf(w, target)})`, persons: [bridge.id, target.id], weeks: 2, cost: 1, funds: 0,
        obstacles: [`Depende de cuánto valore ${firstN(w, target.id)} a ${firstN(w, bridge.id)}`, 'Tu interlocutor puede pedir algo a cambio'], outcomes: ['Te presenta y la impresión es buena', 'Te presenta, pero la reunión es fría', `${firstN(w, bridge.id)} prefiere no hacerlo`], ctx: { bridge: bridge.id, target: target.id } };
    },
    resolve: (w, t) => { const b = String(t.ctx.bridge); const tg = String(t.ctx.target); if (disp(w, b) + w.rng.normal(0, 10) < 0) return `${firstN(w, b)} prefiere no hacer la presentación por ahora.`; const via = (ch(w, b)?.relations[tg] ?? 0); rel(w, tg, { familiarity: 15, trust: via > 30 ? 6 : 1 }); rel(w, b, { dependence: 3 }, 'menor'); P(w).cooldowns[`ctx|presentacion|${tg}`] = w.s.week + 30; return via > 30 ? `${firstN(w, b)} te presenta a ${name(w, tg)}: la impresión es buena.` : `Conoces a ${name(w, tg)}; la reunión es correcta, sin más.`; } },
  { id: 'asamblea_tema', replaces: 'Asistir a una asamblea / Participar en política',
    build: (w) => {
      const p = party(w); if (!p) return null;
      const arc = P(w).arcs.find((a) => a.status !== 'resuelta' && a.status !== 'suspendida');
      const bill = w.s.bills.find((b) => b.closedWeek === undefined && b.area === me(w).specialty);
      const topic = arc ? `la disputa «${arc.title}»` : bill ? `el proyecto «${bill.title.replace(/^Mensaje: /, '')}»` : `${problemOf(w, homeArea(w))} en ${comuna(home(w))}`;
      return { variant: arc ? 'trama' : bill ? 'proyecto' : 'territorio', title: `Intervenir en la asamblea de ${p.short} sobre ${arc ? 'la disputa en curso' : bill ? 'un proyecto en trámite' : 'un problema local'}`, objective: `Fijar una postura propia sobre ${topic}`, persons: [], cut: home(w), weeks: 1, cost: 1, funds: 0,
        obstacles: ['Puede haber militantes que piensen distinto', 'Lo que digas quedará registrado'], outcomes: ['Tu intervención ordena la discusión', 'Discusión sin conclusiones', 'Te enfrentas a un sector'], ctx: { topic, arc: arc?.id ?? '', bill: bill?.id ?? '' } };
    },
    resolve: (w, t) => {
      const q = skill(w, 'oratoria', 'tecnico'); w.s.dialogue?.positions.push({ week: w.s.week, topic: t.ctx.bill ? `proyecto:${t.ctx.bill}` : `asamblea_${t.variant}`, stance: 1, source: 'asamblea' });
      const peers = Object.values(w.s.characters).filter((c) => c.status === 'activo' && !c.isPlayer && !c.realId && c.partyId === me(w).partyId && c.regionId === me(w).regionId).slice(0, 4);
      const reactions: string[] = [];
      for (const c of peers) { const agree = (w.rng.next() + q) > 0.9; rel(w, c.id, agree ? { respect: 3, cooperation: 2 } : { trust: -2 }, 'menor'); if (reactions.length < 2) reactions.push(`${firstN(w, c.id)} ${agree ? 'te respalda' : 'discrepa'}`); }
      rep(w, 'confianzaPartido', q > 0.5 ? 2 : 0.5); org(w, 0.5);
      return `${q > 0.5 ? 'Tu intervención ordena la discusión' : 'La asamblea discute sin concluir'}${reactions.length ? `: ${reactions.join('; ')}` : ''}.`;
    } },
  { id: 'encuentro', replaces: 'Organizar un acto político / Aumentar popularidad',
    build: (w) => { const pr = Object.entries(w.s.comunas[String(home(w))]?.priorities ?? {}).sort((x, y) => (y[1] as number) - (x[1] as number)).slice(0, 3).map((x) => x[0]); const a = (pr.length ? pr[w.rng.int(0, pr.length - 1)] : homeArea(w)) as ReturnType<typeof homeArea>; const prob = problemOf(w, a); const cut = w.rng.chance(0.25) ? neighbor(w) : home(w); return { variant: cut === home(w) ? 'propia' : 'vecina', title: `Organizar un encuentro vecinal en ${comuna(cut)} sobre ${prob}`, objective: `Que los vecinos de ${comuna(cut)} te identifiquen con una solución concreta`, persons: [], cut, weeks: 2, cost: 2, funds: 3,
      obstacles: ['La convocatoria depende de tu organización local', 'La autoridad local puede verte como competencia'], outcomes: ['Asistencia alta y cobertura local', 'Asistencia escasa', 'Un vecino molesto te encara en público'], ctx: { prob, cut } }; },
    resolve: (w, t) => { const cut = Number(t.ctx.cut); const att = capitalOf(w.s).organization / 60 + (w.s.comunas[String(cut)]?.discontent ?? 40) / 150 + w.rng.normal(0, 0.15); if (att > 0.55) { land(w, cut, 5); rep(w, 'popularidad', 1.5); regRep(w, me(w).regionId, 2); return `Más de cien vecinos en ${comuna(cut)}: tu propuesta sobre ${t.ctx.prob} queda en la radio local.`; } if (att > 0.3) { land(w, cut, 2); return `Asisten unos cuarenta vecinos. Útil, pero modesto.`; } rejection(w, 1); land(w, cut, 0.5); return 'Llegan pocas personas y un vecino te reprocha que «aparecen solo en campaña».'; } },
  { id: 'minuta', replaces: 'Estudiar y prepararse / Mejorar liderazgo técnico',
    build: (w) => { const bill = w.s.bills.find((b) => b.closedWeek === undefined && b.area === me(w).specialty) ?? w.s.bills.find((b) => b.closedWeek === undefined); const leg = Object.values(w.s.characters).find((c) => c.status === 'activo' && !c.isPlayer && !c.realId && isLeg(c) && c.partyId === me(w).partyId && c.regionId === me(w).regionId) ?? Object.values(w.s.characters).find((c) => c.status === 'activo' && !c.isPlayer && !c.realId && isLeg(c) && c.partyId === me(w).partyId);
      if (!bill || !leg) return null; return { variant: 'proyecto', title: `Preparar una minuta sobre «${bill.title.replace(/^Mensaje: /, '')}» para ${name(w, leg.id)}`, objective: 'Que tu análisis llegue a la discusión parlamentaria', persons: [leg.id], weeks: 2, cost: 1, funds: 0,
        obstacles: ['Debe ser técnicamente sólida', `${firstN(w, leg.id)} recibe muchas minutas`], outcomes: ['La usa en comisión y te cita', 'La lee y la archiva', 'Te pide más precisión'], ctx: { bill: bill.id, leg: leg.id, area: bill.area } }; },
    resolve: (w, t) => { const q = skill(w, 'tecnico', 'gestion'); const leg = String(t.ctx.leg); rep(w, 'prestigioTecnico', 1 + q * 2); if (q > 0.55 && disp(w, leg) > -10) { rel(w, leg, { respect: 6, cooperation: 4 }); rep(w, 'relacionesParlamentarias', 2); return `${firstN(w, leg)} usa tu minuta en la comisión y te menciona.`; } if (q > 0.35) return 'Tu minuta se lee y se archiva.'; return `${firstN(w, leg)} te pide más precisión: hay errores en las cifras.`; } },
  { id: 'radio', replaces: 'Dar una entrevista genérica / Aumentar visibilidad',
    build: (w) => { const pos = w.s.dialogue?.positions.slice(-1)[0]; const critics = Object.values(w.s.characters).filter((c) => c.status === 'activo' && !c.realId && !c.isPlayer && c.regionId === me(w).regionId && c.partyId !== me(w).partyId && c.offices.length > 0 && (P(w).cooldowns[`ctx|radio|${c.id}`] ?? -1) <= w.s.week); const critic = w.rng.chance(0.6) && critics.length ? critics[w.rng.int(0, critics.length - 1)] : undefined; const arc = P(w).arcs.find((a) => a.status !== 'resuelta'); const bill = w.s.bills.filter((x) => x.closedWeek === undefined).slice(-3)[w.rng.int(0, 2)]; const opts = [AREA_LABELS[homeArea(w)].toLowerCase(), AREA_LABELS[me(w).specialty].toLowerCase(), ...(arc ? [arc.title.toLowerCase()] : []), ...(bill ? [`el proyecto «${bill.title.replace(/^Mensaje: /, '')}»`] : [])]; const topic = opts[w.rng.int(0, opts.length - 1)];
      return { variant: critic ? 'respuesta' : 'tema', title: critic ? `Responder en una radio regional a ${name(w, critic.id)} sobre ${topic}` : `Explicar en una radio regional tu postura sobre ${topic}`, objective: 'Fijar tu postura en la región con una idea concreta', persons: critic ? [critic.id] : [], weeks: 1, cost: 1, funds: 0,
        obstacles: ['El conductor puede ser incisivo', pos ? 'Lo que digas se compara con tus posturas anteriores' : 'Aún eres poco conocido/a'], outcomes: ['Buena entrevista, citada en la prensa', 'Entrevista correcta', 'Una frase te complica'], ctx: { critic: critic?.id ?? '', topic } }; },
    resolve: (w, t) => { const q = skill(w, 'comunicacion', 'oratoria'); regRep(w, me(w).regionId, 1 + q * 3); w.s.dialogue?.positions.push({ week: w.s.week, topic: `tema_${t.ctx.topic}`, stance: 1, source: 'entrevista:radio' }); if (t.ctx.critic) { rel(w, String(t.ctx.critic), { rivalry: 3 }, 'menor'); P(w).cooldowns[`ctx|radio|${t.ctx.critic}`] = w.s.week + 10; } if (q > 0.55) { rep(w, 'reconocimiento', 1); return 'Buena entrevista: la prensa regional cita tu propuesta.'; } if (q > 0.3) return 'Entrevista correcta.'; rep(w, 'credibilidad', -1.5); return 'Una frase tuya se recorta y circula fuera de contexto.'; } },
  { id: 'aportes', replaces: 'Recaudar recursos',
    build: (w) => { const ini = P(w).initiatives.find((i) => i.status === 'en_curso'); const camp = w.s.player.campaign; if (!ini && !camp) return null; const net = ['comerciantes de la feria de ' + comuna(home(w)), 'profesionales de tu red', 'militantes con aportes regulares'][w.rng.int(0, 2)];
      return { variant: camp ? 'campana' : 'iniciativa', title: `Pedir aportes a ${net} para ${camp ? 'tu campaña' : `«${ini!.title}»`}`, objective: 'Financiar tu proyecto con aportes declarados', persons: [], weeks: 1, cost: 1, funds: 0,
        obstacles: ['Quien aporta espera ser escuchado/a después', 'Solo aportes legales y declarados'], outcomes: ['Aportes suficientes', 'Aportes modestos', 'Un aportante pide algo a cambio'], ctx: { net } }; },
    resolve: (w, t) => { const amt = Math.round((1 + me(w).attrs.redes / 25 + me(w).rep.reconocimiento / 15 + capitalOf(w.s).organization / 20) * 10) / 10; funds(w, amt); if (chance(w, 0.2)) { follow(w, 'c_colaborador_ayuda', 4, {}); return `Reúnes ${amt} MM$ declarados de ${t.ctx.net}. Uno de los aportantes ya te pidió «una reunión».`; } return `Reúnes ${amt} MM$ declarados de ${t.ctx.net}.`; } },
  { id: 'terreno', replaces: 'Construir redes territoriales / Ganar influencia',
    build: (w) => { const cut = w.rng.chance(0.3) ? neighbor(w) : home(w); const sector = ['la población del sector norte', 'las villas junto a la carretera', 'el sector rural de la comuna', 'los condominios sociales del centro'][w.rng.int(0, 3)]; const cs = w.s.comunas[String(cut)];
      return { variant: (cs?.discontent ?? 40) > 55 ? 'malestar' : 'tranquilo', title: `Recorrer ${sector} de ${comuna(cut)} con dirigentes vecinales`, objective: `Conocer a las juntas de vecinos y sumar referentes en ${comuna(cut)}`, persons: [], cut, weeks: 1, cost: 1, funds: 0,
        obstacles: [(cs?.discontent ?? 40) > 55 ? 'Hay malestar con la política: te pueden recibir mal' : 'Otros dirigentes ya trabajan el sector', 'El arraigo se construye lento'], outcomes: ['Sumas una dirigencia vecinal a tu red', 'Te conocen, sin compromiso', 'Te reciben con desconfianza'], ctx: { cut, sector } }; },
    resolve: (w, t) => { const cut = Number(t.ctx.cut); const hostile = t.variant === 'malestar'; const q = skill(w, 'carisma', 'redes') - (hostile ? 0.15 : 0); land(w, cut, 1 + q * 3); if (q > 0.5) { org(w, 1); return `Una presidenta de junta de vecinos de ${t.ctx.sector} se suma a tu red.`; } if (q > 0.25) return 'Te conocen, sin compromisos.'; if (hostile) discontent(w, cut, 0.5); return 'Te reciben con desconfianza: «otro político más».'; } },
  { id: 'gira', replaces: 'Visitar una región',
    build: (w) => { const lead = localFigure(w); if (!lead) return null; const cut = neighbor(w); return { variant: relOf(w, lead.id).familiarity < 12 ? 'desconocido' : 'conocido', title: `Acompañar a ${name(w, lead.id)} en una gira por ${comuna(cut)}`, objective: `Darte a conocer fuera de ${comuna(home(w))} de la mano de la dirigencia regional`, persons: [lead.id], cut, weeks: 1, cost: 2, funds: 2,
      obstacles: ['Es su gira, no la tuya: el protagonismo es de quien invita', 'Viaje y tiempo'], outcomes: ['Te presenta a dirigentes de otra comuna', 'Haces de asistente y poco más'], ctx: { lead: lead.id, cut } }; },
    resolve: (w, t) => { const l = String(t.ctx.lead); funds(w, -2); const ok = disp(w, l) + skill(w, 'carisma') * 30 + w.rng.normal(0, 8) > 15; land(w, Number(t.ctx.cut), ok ? 3 : 1); regRep(w, me(w).regionId, ok ? 3 : 1); rel(w, l, { familiarity: 8, cooperation: ok ? 5 : 2 }, 'menor'); return ok ? `${firstN(w, l)} te presenta a los dirigentes de ${comuna(Number(t.ctx.cut))}: varios te piden el contacto.` : 'Acompañas la gira, pero el protagonismo es de otros.'; } },
  { id: 'voluntarios', replaces: 'Mejorar liderazgo',
    build: (w) => { const ini = P(w).initiatives.find((i) => i.status === 'en_curso'); const arc = P(w).arcs.find((a) => a.status === 'activa' || a.status === 'escalando'); if (!ini && !arc) return null; const what = ini ? `«${ini.title}»` : `tu posición en «${arc!.title}»`;
      return { variant: ini ? 'iniciativa' : 'trama', title: `Formar un equipo de voluntarios para ${what}`, objective: 'Pasar de hacerlo todo solo/a a coordinar un equipo', persons: [], weeks: 2, cost: 1, funds: 0,
        obstacles: ['Los voluntarios se van si no hay tareas claras', 'Coordinar cuesta tiempo'], outcomes: ['Un equipo estable que trabaja sin ti', 'Gente entusiasta pero desordenada'], ctx: { ini: ini?.id ?? '' } }; },
    resolve: (w, t) => { const q = skill(w, 'liderazgo', 'gestion'); org(w, q > 0.5 ? 3 : 1); const ini = P(w).initiatives.find((i) => i.id === t.ctx.ini); if (ini && ini.status === 'en_curso') { ini.strength += q > 0.5 ? 5 : 1; ini.log.push({ week: w.s.week, text: q > 0.5 ? 'Un equipo de voluntarios trabaja por el proyecto.' : 'Los voluntarios ayudan, con desorden.', tone: q > 0.5 ? 1 : 0 }); } return q > 0.5 ? 'Armas un equipo estable: ya no dependes solo de ti.' : 'El equipo existe, pero necesita mucha coordinación.'; } },
];
export const CONTEXT_TEMPLATES = TPLS.map((t) => ({ id: t.id, replaces: t.replaces }));
const BY_ID = Object.fromEntries(TPLS.map((t) => [t.id, t])) as Record<string, Tpl>;

/** Renueva las acciones contextuales: 4–5 situaciones distintas por semana, sin repetir plantilla. */
export function refreshOffers(w: W): void {
  const st = P(w);
  st.offers = [];
  const order = [...TPLS].sort(() => w.rng.next() - 0.5);
  for (const t of order) {
    if (st.offers.length >= 5) break;
    if ((st.cooldowns[`tpl|${t.id}`] ?? -1) > w.s.week) continue;
    if (st.tasks.some((x) => x.tpl === t.id && !x.result)) continue;
    let b: ReturnType<Tpl['build']> = null;
    try { b = t.build(w); } catch { b = null; }
    if (!b) continue;
    st.offers.push({ ...b, id: newPid(w.s, 'off'), week: w.s.week, tpl: t.id });
  }
}

export function offerBlocked(w: W, id: string): string | null {
  const o = P(w).offers.find((x) => x.id === id); if (!o) return 'La situación ya no está disponible';
  if (w.s.player.actionPoints < o.cost) return `Requiere ${o.cost} PA`;
  if (o.funds && w.s.player.personalFunds < o.funds) return `Requiere ${o.funds} MM$`;
  return null;
}

export function acceptOffer(w: W, id: string): string {
  const b = offerBlocked(w, id); if (b) return b;
  const st = P(w); const o = st.offers.find((x) => x.id === id)!;
  w.s.player.actionPoints -= o.cost; if (o.funds) funds(w, -o.funds);
  st.offers = st.offers.filter((x) => x.id !== id);
  st.cooldowns[`tpl|${o.tpl}`] = w.s.week + 2;
  const t: ContextTask = { id: newPid(w.s, 'tsk'), tpl: o.tpl, variant: o.variant, title: o.title, startWeek: w.s.week, dueWeek: w.s.week + o.weeks - 1, persons: o.persons, cut: o.cut, ctx: o.ctx };
  st.tasks.push(t);
  if (o.weeks <= 1) { t.result = BY_ID[o.tpl].resolve(w, t); return t.result; }
  return `En marcha: ${o.title}. Resultado en ${o.weeks} semanas.`;
}

export function weeklyTasks(w: W): void {
  const st = P(w);
  for (const t of st.tasks) if (!t.result && w.s.week >= t.dueWeek) { t.result = BY_ID[t.tpl]?.resolve(w, t) ?? 'Sin resultado.'; w.s.player.lastActionResults.push(`${t.title}: ${t.result}`); }
  if (st.tasks.length > 60) st.tasks.splice(0, st.tasks.length - 60);
}
export const _ctxUnused = (c: Ctx) => c;
export { clamp, mem, has };
