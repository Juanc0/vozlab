/**
 * DEMO CONTENT — the Spanish demo graph for the VozLab walkthrough.
 *
 * DEVELOPMENT ONLY. Consumed by `seed-dev.ts`; never wire it into the app
 * startup, `db:migrate` or CI.
 *
 * What this holds
 * ---------------
 * Three independent focus clusters (movilidad, espacios, vida académica),
 * each with 4 Problems + 3 Ideas + 1 Resource and 11 typed relations, plus
 * two bridges that connect the clusters so the demo is a graph and not
 * three islands. Every title, description, attribute, proposal and
 * discussion is written in Spanish, the way a student would write it.
 *
 * Rules the data obeys
 * --------------------
 * - **Ontology**: every relation respects the domain/range of its
 *   `meta.object_properties` row (`RELATES_TO` Problem→Idea, `INVOLVES`
 *   Problem→Problem, `ADDRESSES` Idea→Problem, `BUILDS_ON` Idea→Idea,
 *   `EVIDENCED_BY` Problem→Resource). A relation whose domain/range does
 *   not match would be a lie in the demo.
 * - **Attributes**: every node carries exactly the datatype properties its
 *   class declares (`sector`/`alcance` for Problem, `horizonte`/
 *   `costoEstimado` for Idea, `enlace`/`tipoFuente` for Resource).
 * - **Determinism**: every identifier and every timestamp is fixed, so the
 *   seed can be re-run without changing the database.
 * - **Scores**: the `community_score` of a node, an edge and a post is the
 *   sum of the votes recorded for it in the interactions log — the demo
 *   scores are the votes. The one exception is the old proposal
 *   `PR-BECAS`, whose score is the historical aggregate of the community
 *   (the log only keeps the three demo identities); the auto-apply path
 *   needs a score of 10 or more.
 * - **Votes**: the maintainer — the identity the presenter signs in with —
 *   votes on the relations only, so the presenter can still cast a live
 *   vote on any node, proposal or post during the demo.
 *
 * The identities live in `./dev-identities.js`, shared with
 * `mint-dev-token.ts`: the nodes are authored by the maintainer (so the
 * presenter can approve the proposals on them) and the proposals are
 * written by the member.
 */
import { authorHashFor, type DevIdentityName } from './dev-identities.js';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type DemoClusterKey = 'movilidad' | 'espacios' | 'academico';

/** The node key inside a cluster: `p1..p4` Problems, `i1..i3` Ideas, `r1` Resource. */
export type DemoNodeKey = 'p1' | 'p2' | 'p3' | 'p4' | 'i1' | 'i2' | 'i3' | 'r1';

export type DemoClassKey = 'Problem' | 'Idea' | 'Resource';

export type DemoRelationKey =
  | 'RELATES_TO'
  | 'INVOLVES'
  | 'ADDRESSES'
  | 'BUILDS_ON'
  | 'EVIDENCED_BY';

export type DemoTargetType = 'NODE' | 'EDGE' | 'PROPOSAL' | 'POST';

export type DemoInteractionType = 'UPVOTE' | 'DOWNVOTE' | 'SUPPORT' | 'VALIDATE';

/** Spanish label of every relation, used by the seed report. */
export const RELATION_LABELS: Readonly<Record<DemoRelationKey, string>> = Object.freeze({
  RELATES_TO: 'se relaciona con',
  INVOLVES: 'involucra',
  ADDRESSES: 'atiende',
  BUILDS_ON: 'se apoya en',
  EVIDENCED_BY: 'está respaldado por',
});

// ---------------------------------------------------------------------------
// Deterministic identifiers
// ---------------------------------------------------------------------------

/** 8-hex-char prefix per cluster; the node index completes the UUID. */
const CLUSTER_UUID_PREFIX: Readonly<Record<DemoClusterKey, string>> = Object.freeze({
  movilidad: 'd0de0001',
  espacios: 'd0de0002',
  academico: 'd0de0003',
});

/** 8-hex-char prefix per cluster for the relations of that cluster. */
const CLUSTER_EDGE_UUID_PREFIX: Readonly<Record<DemoClusterKey, string>> = Object.freeze({
  movilidad: 'd0de0011',
  espacios: 'd0de0012',
  academico: 'd0de0013',
});

/** Prefix of the two relations that cross two clusters. */
const BRIDGE_EDGE_UUID_PREFIX = 'd0de0014';

const PROPOSAL_UUID_PREFIX = 'd0de0021';
const THREAD_UUID_PREFIX = 'd0de0031';
const POST_UUID_PREFIX = 'd0de0041';
const VOTE_UUID_PREFIX = 'd0de0051';

/** Position of every node key inside its cluster (the UUID suffix). */
const NODE_UUID_INDEX: Readonly<Record<DemoNodeKey, number>> = Object.freeze({
  p1: 1,
  p2: 2,
  p3: 3,
  p4: 4,
  i1: 5,
  i2: 6,
  i3: 7,
  r1: 8,
});

/** Position of every proposal in the demo (the UUID suffix). */
const PROPOSAL_UUID_INDEX: Readonly<Record<string, number>> = {
  'PR-CICLO': 1,
  'PR-AULAS': 2,
  'PR-BECAS': 3,
  'PR-HISTORIA': 4,
};

/** A deterministic, v4-shaped UUID built from a prefix and an index. */
function demoUuid(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

export function demoNodeId(cluster: DemoClusterKey, key: DemoNodeKey): string {
  return demoUuid(CLUSTER_UUID_PREFIX[cluster], NODE_UUID_INDEX[key]);
}

export function demoEdgeId(cluster: DemoClusterKey, key: string): string {
  return demoUuid(CLUSTER_EDGE_UUID_PREFIX[cluster], Number(key.slice(1)));
}

export function demoBridgeId(key: string): string {
  return demoUuid(BRIDGE_EDGE_UUID_PREFIX, Number(key.slice(1)));
}

export function demoProposalId(key: string): string {
  const index = PROPOSAL_UUID_INDEX[key];
  if (index === undefined) {
    throw new Error(`unknown proposal key: ${key}`);
  }
  return demoUuid(PROPOSAL_UUID_PREFIX, index);
}

export function demoThreadId(key: string): string {
  return demoUuid(THREAD_UUID_PREFIX, Number(key.slice(1)));
}

export function demoPostId(key: string): string {
  return demoUuid(POST_UUID_PREFIX, Number(key.slice(1)));
}

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

export interface DemoNodeSpec {
  readonly key: DemoNodeKey;
  readonly typeKey: DemoClassKey;
  readonly title: string;
  readonly description: string;
  /** Exactly the datatype properties declared by the class of the node. */
  readonly attributes: Readonly<Record<string, string | number>>;
  /** ISO-8601 instant; fixed so the seed is reproducible. */
  readonly createdAt: string;
  /** ISO-8601 instant; defaults to `createdAt`. */
  readonly updatedAt?: string;
}

export interface DemoEdgeSpec {
  /** Local key of the relation inside its cluster (`e1`, `e2`, …). */
  readonly key: string;
  readonly from: DemoNodeKey;
  readonly to: DemoNodeKey;
  readonly relationKey: DemoRelationKey;
}

export interface DemoClusterSpec {
  readonly key: DemoClusterKey;
  readonly label: string;
  readonly summary: string;
  readonly nodes: readonly DemoNodeSpec[];
  readonly edges: readonly DemoEdgeSpec[];
}

export interface DemoBridgeSpec {
  readonly key: string;
  readonly fromCluster: DemoClusterKey;
  readonly from: DemoNodeKey;
  readonly toCluster: DemoClusterKey;
  readonly to: DemoNodeKey;
  readonly relationKey: DemoRelationKey;
}

/**
 * The three focus clusters.
 *
 * Every cluster follows the same shape so the demo reads consistently: the
 * first Problem is the hub (its neighbours and their neighbours cover the
 * whole cluster at two hops), the second Problem carries the Resource, and
 * the fourth Problem is deliberately left without an Idea — a problem the
 * community raised and nobody has solved yet.
 */
export const DEMO_CLUSTERS: readonly DemoClusterSpec[] = [
  {
    key: 'movilidad',
    label: 'Movilidad y transporte',
    summary: 'Transporte interno, ciclovía, parqueaderos y cruces peatonales.',
    nodes: [
      {
        key: 'p1',
        typeKey: 'Problem',
        title: 'El transporte interno no alcanza a llegar a tiempo a las aulas del primer turno',
        description:
          'Entre las 7:00 y las 9:00 el único bus interno que conecta la estación de buses con la sede norte sale apenas dos veces. En promedio se demora 45 minutos y con lluvia el recorrido se alarga otros veinte, así que quien tiene clase a las 8:00 llega cuando la clase ya empezó.',
        attributes: { sector: 'Transporte', alcance: 'Campus' },
        createdAt: '2026-06-15T14:20:00Z',
      },
      {
        key: 'p2',
        typeKey: 'Problem',
        title: 'La avenida principal no tiene ciclovía y los ciclistas compiten con los buses',
        description:
          'El tramo de 1,8 km entre la portería norte y la sede de Ingeniería no tiene ciclovía: los ciclistas terminan usando el carril del bus o la acera, y en hora pico la accidentalidad se repite cada mes.',
        attributes: { sector: 'Transporte', alcance: 'Ciudad' },
        createdAt: '2026-06-26T08:55:00Z',
      },
      {
        key: 'p3',
        typeKey: 'Problem',
        title: 'Los parqueaderos de estudiantes están saturados desde las 7:30',
        description:
          'Los 320 cupos del parqueadero norte se llenan antes de la primera clase. Quien llega después debe aparcar en las calles de los residenciales, con riesgo de multa y de tapar la entrada del parqueadero de visitas.',
        attributes: { sector: 'Transporte', alcance: 'Campus' },
        createdAt: '2026-07-06T16:40:00Z',
      },
      {
        key: 'p4',
        typeKey: 'Problem',
        title: 'Los cruces peatonales del campus no tienen semáforo ni señalización visible',
        description:
          'En los cuatro cruces entre la portería, la biblioteca y el edificio de comidas no hay semáforo ni demarcación pintada. Con el flujo del bus interno la gente cruza corriendo y en dos de los cuatro puntos hubo atropellos el semestre pasado.',
        attributes: { sector: 'Transporte', alcance: 'Campus' },
        createdAt: '2026-07-11T11:25:00Z',
      },
      {
        key: 'i1',
        typeKey: 'Idea',
        title: 'Shuttle eléctrico con rutas fijas y frecuencia de 10 minutos',
        description:
          'Propongo un servicio de buses eléctricos de 18 plazas con cuatro rutas fijas y una frecuencia máxima de 10 minutos entre las 7:00 y las 9:00, a cargo del mismo operador del parqueadero. La inversión estimada es de 48 millones de pesos y se recupera con el ahorro en los contratos de transporte externo.',
        attributes: { horizonte: 'Corto plazo', costoEstimado: 48000000 },
        createdAt: '2026-06-18T09:40:00Z',
      },
      {
        key: 'i2',
        typeKey: 'Idea',
        title: 'Ciclovía segregada de 3,5 km con parqueaderos para bicicleta',
        description:
          'Una ciclovía segregada de 3,5 km sobre el carril sobrante de la avenida, con 400 cupos de parqueadero de bicicleta en portería norte, Ingeniería y la biblioteca, y un plan de mantenimiento trimestral a cargo de la facultad de Ingeniería. Se estima en 320 millones de pesos.',
        attributes: { horizonte: 'Medio plazo', costoEstimado: 320000000 },
        createdAt: '2026-06-29T10:15:00Z',
      },
      {
        key: 'i3',
        typeKey: 'Idea',
        title: 'Estacionamiento por turnos con reserva previa para la jornada de la mañana',
        description:
          'Un esquema de reserva por franja horaria (7:00–10:00 y 16:00–19:00) con cupos limitados y tarifa progresiva para quien llega solo en carro. La administración de espacios estima 15 millones de pesos al año y un aumento del 12 % en el uso del transporte público.',
        attributes: { horizonte: 'Medio plazo', costoEstimado: 15000000 },
        createdAt: '2026-07-16T15:05:00Z',
      },
      {
        key: 'r1',
        typeKey: 'Resource',
        title: 'Informe de movilidad sostenible del campus 2025',
        description:
          'El informe de la oficina de planeación reúne el inventario de rutas, la medición de los tiempos de viaje del bus interno y la encuesta a 1.200 estudiantes sobre su medio de llegada al campus. Está disponible en la intranet de planeación.',
        attributes: {
          enlace: 'https://intranet.university.edu/planeacion/movilidad-2025',
          tipoFuente: 'Informe',
        },
        createdAt: '2026-06-20T13:05:00Z',
      },
    ],
    edges: [
      { key: 'e1', from: 'p1', to: 'i1', relationKey: 'RELATES_TO' },
      { key: 'e2', from: 'p2', to: 'i2', relationKey: 'RELATES_TO' },
      { key: 'e3', from: 'p3', to: 'i3', relationKey: 'RELATES_TO' },
      { key: 'e4', from: 'p1', to: 'p2', relationKey: 'INVOLVES' },
      { key: 'e5', from: 'p1', to: 'p3', relationKey: 'INVOLVES' },
      { key: 'e6', from: 'p1', to: 'p4', relationKey: 'INVOLVES' },
      { key: 'e7', from: 'i1', to: 'p1', relationKey: 'ADDRESSES' },
      { key: 'e8', from: 'i2', to: 'p2', relationKey: 'ADDRESSES' },
      { key: 'e9', from: 'i3', to: 'p3', relationKey: 'ADDRESSES' },
      { key: 'e10', from: 'i2', to: 'i1', relationKey: 'BUILDS_ON' },
      { key: 'e11', from: 'p2', to: 'r1', relationKey: 'EVIDENCED_BY' },
    ],
  },
  {
    key: 'espacios',
    label: 'Espacios y accesibilidad',
    summary: 'Temperatura, laboratorios, accesibilidad y ruido en las aulas.',
    nodes: [
      {
        key: 'p1',
        typeKey: 'Problem',
        title: 'En los salones de la facultad de Ingeniería la temperatura llega a 27 grados',
        description:
          'El sistema de ventilación de los salones 3A y 3B no enciende y las aulas quedan a 27 grados en la tarde. Los estudiantes reportan somnolencia y dificultad para concentrarse en las sesiones de las 2:00 p. m.',
        attributes: { sector: 'Espacios', alcance: 'Facultad' },
        createdAt: '2026-06-17T13:45:00Z',
      },
      {
        key: 'p2',
        typeKey: 'Problem',
        title: 'El laboratorio de química abre una hora después de las clases de la mañana',
        description:
          'El laboratorio de química abre a las 9:00, pero las clases empiezan a las 7:00. Quien necesita equipos para un taller de las 7:30 espera hora y media en el pasillo, y varios grupos se saltan la práctica.',
        attributes: { sector: 'Espacios', alcance: 'Facultad' },
        createdAt: '2026-07-02T09:30:00Z',
      },
      {
        key: 'p3',
        typeKey: 'Problem',
        title: 'El baño accesible de la biblioteca está fuera de servicio desde hace dos meses',
        description:
          'El único baño accesible de la biblioteca lleva dos meses cerrado por una falla en la puerta. Quien lo necesita tiene que caminar hasta el del edificio de Ingeniería, ochocientos metros más lejos y con un tramo en escalera.',
        attributes: { sector: 'Espacios', alcance: 'Campus' },
        createdAt: '2026-07-08T17:05:00Z',
      },
      {
        key: 'p4',
        typeKey: 'Problem',
        title: 'El ruido de la calle hace imposible estudiar en la sala 4 de la biblioteca',
        description:
          'La sala de estudio 4 da a la calle principal y no tiene aislamiento acústico. En hora pico se oyen los buses, las motos y las obras de la avenida; el semestre pasado el 70 % de los usuarios dejó de usarla.',
        attributes: { sector: 'Espacios', alcance: 'Campus' },
        createdAt: '2026-07-22T14:20:00Z',
      },
      {
        key: 'i1',
        typeKey: 'Idea',
        title: 'Ventilación con sensores de temperatura y CO2 en cada salón',
        description:
          'Propongo instalar ventilación con recuperación de aire y sensores de CO2 y temperatura en los salones 3A y 3B, con lectura en vivo en la intranet. Son 85 millones de pesos y cubre los 24 salones de la facultad en dos etapas.',
        attributes: { horizonte: 'Corto plazo', costoEstimado: 85000000 },
        createdAt: '2026-06-23T11:10:00Z',
      },
      {
        key: 'i2',
        typeKey: 'Idea',
        title: 'Apertura anticipada del laboratorio de química con monitor de apoyo',
        description:
          'Abrir el laboratorio de química a las 6:30, con un monitor de apoyo hasta las 8:00 y cupos reservados para los talleres de primera hora. No requiere obra: solo ajuste de turnos y un horario publicado en la intranet.',
        attributes: { horizonte: 'Corto plazo', costoEstimado: 6000000 },
        createdAt: '2026-07-14T10:40:00Z',
      },
      {
        key: 'i3',
        typeKey: 'Idea',
        title: 'Salas de estudio silenciosas con reserva en línea y aislamiento acústico',
        description:
          'Habilitar cuatro salas de estudio con aislamiento acústico y reserva en línea de una hora, repartidas entre la biblioteca y el centro de reposo. Cuestan 60 millones de pesos y la biblioteca ya tiene los planos para adaptar los espacios.',
        attributes: { horizonte: 'Medio plazo', costoEstimado: 60000000 },
        createdAt: '2026-07-27T16:00:00Z',
      },
      {
        key: 'r1',
        typeKey: 'Resource',
        title: 'Encuesta de condiciones de los espacios 2026',
        description:
          'La encuesta de la asociación de estudiantes recogió 860 respuestas sobre temperatura, ruido, accesibilidad e iluminación de aulas y baños. Los datos crudos están en el repositorio de la asociación, con el consentimiento de quienes participaron.',
        attributes: {
          enlace: 'https://estudiantes.university.edu/espacios/encuesta-2026',
          tipoFuente: 'Encuesta',
        },
        createdAt: '2026-06-21T09:20:00Z',
      },
    ],
    edges: [
      { key: 'e1', from: 'p1', to: 'i1', relationKey: 'RELATES_TO' },
      { key: 'e2', from: 'p2', to: 'i2', relationKey: 'RELATES_TO' },
      { key: 'e3', from: 'p4', to: 'i3', relationKey: 'RELATES_TO' },
      { key: 'e4', from: 'p1', to: 'p2', relationKey: 'INVOLVES' },
      { key: 'e5', from: 'p1', to: 'p3', relationKey: 'INVOLVES' },
      { key: 'e6', from: 'p1', to: 'p4', relationKey: 'INVOLVES' },
      { key: 'e7', from: 'i1', to: 'p1', relationKey: 'ADDRESSES' },
      { key: 'e8', from: 'i2', to: 'p2', relationKey: 'ADDRESSES' },
      { key: 'e9', from: 'i3', to: 'p4', relationKey: 'ADDRESSES' },
      { key: 'e10', from: 'i3', to: 'i1', relationKey: 'BUILDS_ON' },
      { key: 'e11', from: 'p1', to: 'r1', relationKey: 'EVIDENCED_BY' },
    ],
  },
  {
    key: 'academico',
    label: 'Vida académica y bienestar',
    summary: 'Becas, salud mental, cafetería, conectividad de los residenciales y acompañamiento.',
    nodes: [
      {
        key: 'p1',
        typeKey: 'Problem',
        title: 'La espera de las becas genera ansiedad y deserción en primer semestre',
        description:
          'El cronograma de becas se publica en la intranet en diciembre y no se actualiza. Quien no está en la sede cuando lo publican se entera por rumores, y en enero se registraron 40 retiros de primer semestre atribuidos a la incertidumbre económica.',
        attributes: { sector: 'Académico', alcance: 'Campus' },
        createdAt: '2026-06-19T15:00:00Z',
      },
      {
        key: 'p2',
        typeKey: 'Problem',
        title: 'La consejería de salud mental no tiene cupo suficiente',
        description:
          'La consejería de salud mental del campus tiene seis profesionales para nueve mil estudiantes y las citas se entregan con tres semanas de espera. El semestre pasado se cancelaron 300 citas por falta de cupos y los casos urgentes se remitieron a una institución externa.',
        attributes: { sector: 'Bienestar', alcance: 'Campus' },
        createdAt: '2026-07-01T10:30:00Z',
      },
      {
        key: 'p3',
        typeKey: 'Problem',
        title: 'La cafetería de la sede norte no alcanza en las horas pico',
        description:
          'Entre las 11:00 y la 1:00 las tres filas de la cafetería de la sede norte se demoran más de veinte minutos y los estudiantes de la jornada de la mañana se quedan sin almuerzo. La cafetería de la sede sur sí alcanza, pero está a quince minutos a pie.',
        attributes: { sector: 'Bienestar', alcance: 'Campus' },
        createdAt: '2026-07-09T12:20:00Z',
      },
      {
        key: 'p4',
        typeKey: 'Problem',
        title: 'El internet de los residenciales se cae todas las noches',
        description:
          'Entre las 9:00 y las 11:00 de la noche la red de los residenciales se cae de forma intermitente, justo cuando se hacen las entregas y las reuniones de proyecto. Los reportes de soporte se responden con tres días de espera y nadie sabe si es el enlace principal o el access point de cada piso.',
        attributes: { sector: 'Académico', alcance: 'Campus' },
        createdAt: '2026-08-10T18:45:00Z',
      },
      {
        key: 'i1',
        typeKey: 'Idea',
        title: 'Atención de salud mental sin cita y refuerzo en la franja de la tarde',
        description:
          'Abrir una franja de atención sin cita los martes y jueves de 5:00 a 7:00 de la tarde en el centro estudiantil, y añadir dos profesionales de medio tiempo para cubrir el semestre. Cuesta 60 millones de pesos al año.',
        attributes: { horizonte: 'Corto plazo', costoEstimado: 60000000 },
        createdAt: '2026-06-24T09:45:00Z',
      },
      {
        key: 'i2',
        typeKey: 'Idea',
        // The title and the description below are the result of the already
        // approved proposal `PR-BECAS` — the delta was applied to the node.
        title: 'Cronograma único de becas, con avisos por correo y seguimiento',
        description:
          'Un calendario único de las tres convocatorias con fechas fijas, publicado en la intranet y enviado por correo a todos los estudiantes, más un formato de seguimiento para que quien se pierde una fecha sepa a quién escribir. Cuesta 8 millones de pesos al año en la plataforma de comunicación.',
        attributes: { horizonte: 'Corto plazo', costoEstimado: 8000000 },
        createdAt: '2026-07-13T11:35:00Z',
        updatedAt: '2026-09-03T16:40:00Z',
      },
      {
        key: 'i3',
        typeKey: 'Idea',
        title: 'Programa de acompañamiento entre pares para primer semestre',
        description:
          'Un programa en el que estudiantes de últimos semestres acompañan a los de primer semestre durante las primeras semanas: recorrido del campus, apoyo en las asignaturas difíciles y orientación de los servicios. Se coordina con bienestar estudiantil y cuesta 20 millones de pesos al año.',
        attributes: { horizonte: 'Medio plazo', costoEstimado: 20000000 },
        createdAt: '2026-08-06T14:10:00Z',
      },
      {
        key: 'r1',
        typeKey: 'Resource',
        title: 'Informe de bienestar estudiantil 2025',
        description:
          'El informe del año pasado consolida las atenciones de la consejería, la encuesta de permanencia y el análisis de las solicitudes de beca. Está en el repositorio de documentos de la universidad, en la sección de planeación.',
        attributes: {
          enlace: 'https://documentos.university.edu/bienestar/informe-2025',
          tipoFuente: 'Informe',
        },
        createdAt: '2026-07-03T08:00:00Z',
      },
    ],
    edges: [
      { key: 'e1', from: 'p1', to: 'i2', relationKey: 'RELATES_TO' },
      { key: 'e2', from: 'p2', to: 'i1', relationKey: 'RELATES_TO' },
      { key: 'e3', from: 'p4', to: 'i3', relationKey: 'RELATES_TO' },
      { key: 'e4', from: 'p1', to: 'p2', relationKey: 'INVOLVES' },
      { key: 'e5', from: 'p1', to: 'p3', relationKey: 'INVOLVES' },
      { key: 'e6', from: 'p1', to: 'p4', relationKey: 'INVOLVES' },
      { key: 'e7', from: 'i2', to: 'p1', relationKey: 'ADDRESSES' },
      { key: 'e8', from: 'i1', to: 'p2', relationKey: 'ADDRESSES' },
      { key: 'e9', from: 'i3', to: 'p4', relationKey: 'ADDRESSES' },
      { key: 'e10', from: 'i2', to: 'i3', relationKey: 'BUILDS_ON' },
      { key: 'e11', from: 'p2', to: 'r1', relationKey: 'EVIDENCED_BY' },
    ],
  },
];

/**
 * The two relations that cross two clusters, so the demo is a graph and not
 * three islands. The clusters keep their own topics; the bridges are the
 * dependencies a real community would notice.
 */
export const DEMO_BRIDGES: readonly DemoBridgeSpec[] = [
  {
    key: 'e1',
    fromCluster: 'academico',
    from: 'p2',
    toCluster: 'espacios',
    to: 'p1',
    relationKey: 'INVOLVES',
  },
  {
    key: 'e2',
    fromCluster: 'academico',
    from: 'i3',
    toCluster: 'movilidad',
    to: 'i1',
    relationKey: 'BUILDS_ON',
  },
];

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export interface DemoProposalSpec {
  /** Local key of the proposal (`PR-CICLO`, `PR-AULAS`, `PR-BECAS`, `PR-HISTORIA`). */
  readonly key: string;
  readonly cluster: DemoClusterKey;
  readonly targetNode: DemoNodeKey;
  readonly proposedChanges: Readonly<Record<string, unknown>>;
  readonly justification: string;
  /** `PENDING` or `APPROVED_BY_AUTHOR`. */
  readonly status: 'PENDING' | 'APPROVED_BY_AUTHOR';
  readonly createdAt: string;
  /** Set only for a resolved proposal. */
  readonly resolvedAt?: string;
  /**
   * The score shown in the demo. It is the sum of the logged votes, except
   * for `PR-BECAS`: its score is the historical aggregate of the community
   * (the interactions log only keeps the three demo identities) and it has
   * to clear the auto-apply threshold of 10.
   */
  readonly communityScore: number;
}

/**
 * The four edit proposals.
 *
 * The three `PENDING` ones are written by the **member**, so the presenter
 * (signed in as the maintainer, the author of the nodes) is the one who can
 * approve them — the pull-request flow the product is about.
 *
 * `PR-BECAS` is older than 14 days with a score of 12, so the moderator's
 * auto-apply path is demonstrable. `PR-HISTORIA` is already
 * `APPROVED_BY_AUTHOR`: its delta is visible in the node it edited.
 */
export const DEMO_PROPOSALS: readonly DemoProposalSpec[] = [
  {
    key: 'PR-CICLO',
    cluster: 'movilidad',
    targetNode: 'p2',
    status: 'PENDING',
    createdAt: '2026-10-11T14:30:00Z',
    communityScore: 2,
    proposedChanges: {
      description:
        'El tramo de 1,8 km entre la portería norte y la sede de Ingeniería no tiene ciclovía: los ciclistas terminan usando el carril del bus o la acera, y en hora pico la accidentalidad se repite cada mes. En lo que va del semestre se han registrado nueve accidentes en el mismo punto.',
    },
    justification:
      'Falta el dato de los accidentes del semestre en la descripción original, y es el que le da urgencia al asunto frente a la municipalidad.',
  },
  {
    key: 'PR-AULAS',
    cluster: 'espacios',
    targetNode: 'p1',
    status: 'PENDING',
    createdAt: '2026-10-02T09:15:00Z',
    communityScore: 2,
    proposedChanges: {
      title: 'En los salones 3A y 3B de Ingeniería la temperatura llega a 27 grados',
      description:
        'El sistema de ventilación de los salones 3A y 3B no enciende y las aulas quedan a 27 grados en la tarde. Los estudiantes reportan somnolencia y dificultad para concentrarse en las sesiones de las 2:00 p. m. La encuesta de espacios confirma que el 68 % de quienes estudian en esos salones dice perder el foco en clase.',
    },
    justification:
      'El título no decía en qué salones ocurre exactamente y eso hacía que se reportaran salones que no tienen el problema. Agregué el dato de la encuesta para que la magnitud quede documentada.',
  },
  {
    key: 'PR-BECAS',
    cluster: 'academico',
    targetNode: 'p2',
    status: 'PENDING',
    createdAt: '2026-08-27T10:00:00Z',
    communityScore: 12,
    proposedChanges: {
      description:
        'La consejería de salud mental del campus tiene seis profesionales para nueve mil estudiantes y las citas se entregan con tres semanas de espera. El semestre pasado se cancelaron 300 citas por falta de cupos y los casos urgentes se remitieron a una institución externa. La encuesta de la asociación ubica la espera real promedio en 24 días.',
    },
    justification:
      'El dato de la encuesta —24 días de espera real— no aparece en ninguna descripción del problema y es lo que permite dimensionarlo ante la dirección.',
  },
  {
    key: 'PR-HISTORIA',
    cluster: 'academico',
    targetNode: 'i2',
    status: 'APPROVED_BY_AUTHOR',
    createdAt: '2026-09-01T11:20:00Z',
    resolvedAt: '2026-09-03T16:40:00Z',
    communityScore: 2,
    proposedChanges: {
      title: 'Cronograma único de becas, con avisos por correo y seguimiento',
      description:
        'Un calendario único de las tres convocatorias con fechas fijas, publicado en la intranet y enviado por correo a todos los estudiantes, más un formato de seguimiento para que quien se pierde una fecha sepa a quién escribir. Cuesta 8 millones de pesos al año en la plataforma de comunicación.',
    },
    justification:
      'El nombre sonaba a un trámite más y no a un calendario, y faltaba decir que los avisos llegan también por correo.',
  },
];

export interface DemoThreadSpec {
  readonly key: string;
  readonly targetType: 'NODE' | 'PROPOSAL';
  /** Cluster + node key for a `NODE` target. */
  readonly targetCluster?: DemoClusterKey;
  readonly targetNode?: DemoNodeKey;
  /** Proposal key for a `PROPOSAL` target. */
  readonly targetProposal?: string;
  readonly title: string;
  readonly createdBy: DevIdentityName;
  readonly createdAt: string;
}

export const DEMO_THREADS: readonly DemoThreadSpec[] = [
  {
    key: 'T1',
    targetType: 'NODE',
    targetCluster: 'movilidad',
    targetNode: 'p1',
    title: '¿Cuánto se demora hoy el bus entre la estación y la sede norte?',
    createdBy: 'maintainer',
    createdAt: '2026-10-13T08:30:00Z',
  },
  {
    key: 'T2',
    targetType: 'NODE',
    targetCluster: 'espacios',
    targetNode: 'p1',
    title: 'Termómetro en el aula, no solo en el pasillo',
    createdBy: 'member',
    createdAt: '2026-10-05T14:00:00Z',
  },
  {
    key: 'T3',
    targetType: 'PROPOSAL',
    targetProposal: 'PR-BECAS',
    title: 'Propuesta: ampliar la evidencia del problema de la consejería',
    createdBy: 'member',
    createdAt: '2026-10-08T17:20:00Z',
  },
];

export interface DemoPostSpec {
  readonly key: string;
  readonly threadKey: string;
  /** `null` for a top-level post. */
  readonly parentPostKey: string | null;
  readonly author: DevIdentityName;
  readonly body: string;
  readonly createdAt: string;
}

export const DEMO_POSTS: readonly DemoPostSpec[] = [
  {
    key: 'M1',
    threadKey: 'T1',
    parentPostKey: null,
    author: 'member',
    body: 'El martes me tocó esperar 38 minutos en la estación con el sol de las 11. Si el bus pasa cada 45 minutos, cualquier retraso se convierte en media hora perdida.',
    createdAt: '2026-10-13T09:02:00Z',
  },
  {
    key: 'M2',
    threadKey: 'T1',
    parentPostKey: null,
    author: 'maintainer',
    body: 'Estoy armando una línea de tiempo con los tiempos reales que reportan ustedes. El dato de los 38 minutos es exactamente el que necesito.',
    createdAt: '2026-10-13T10:15:00Z',
  },
  {
    key: 'M3',
    threadKey: 'T1',
    parentPostKey: 'M2',
    author: 'moderator',
    body: 'Conviene anotarlos por día de la semana: los martes y los jueves el bus sale más lleno y el retraso se multiplica.',
    createdAt: '2026-10-13T11:40:00Z',
  },
  {
    key: 'M4',
    threadKey: 'T2',
    parentPostKey: null,
    author: 'member',
    body: 'Propongo que cada salón tenga un termómetro visible y que la lectura se publique en la intranet. El de la portería no dice nada de lo que pasa adentro.',
    createdAt: '2026-10-05T14:25:00Z',
  },
  {
    key: 'M5',
    threadKey: 'T2',
    parentPostKey: null,
    author: 'moderator',
    body: 'Buena idea. El inventario de los sensores de la facultad ya existe y se pueden instalar sin obra; solo falta el enlace con la intranet.',
    createdAt: '2026-10-05T16:10:00Z',
  },
  {
    key: 'M6',
    threadKey: 'T2',
    parentPostKey: 'M4',
    author: 'member',
    body: '¿Y si además se comparan los salones entre sí? Así se ve rápido cuáles están peor y el mantenimiento deja de ser una queja.',
    createdAt: '2026-10-06T08:45:00Z',
  },
  {
    key: 'M7',
    threadKey: 'T3',
    parentPostKey: null,
    author: 'member',
    body: 'Apoyo la propuesta. El dato de los 24 días de espera real es el que convence a la dirección, y por eso vale la pena dejarlo por escrito.',
    createdAt: '2026-10-08T17:35:00Z',
  },
  {
    key: 'M8',
    threadKey: 'T3',
    parentPostKey: null,
    author: 'maintainer',
    body: 'Cuando la apruebe, dejo también el enlace al informe de bienestar en la descripción, para que el dato se pueda consultar.',
    createdAt: '2026-10-09T09:20:00Z',
  },
  {
    key: 'M9',
    threadKey: 'T3',
    parentPostKey: 'M7',
    author: 'moderator',
    body: 'Recuerdo que, con 12 votos y más de dos semanas de espera, un moderador puede aplicarla si la persona que mantiene el nodo no responde.',
    createdAt: '2026-10-09T10:05:00Z',
  },
  {
    key: 'M10',
    threadKey: 'T3',
    parentPostKey: null,
    author: 'member',
    body: 'De acuerdo, pero mantengamos el hilo abierto mientras tanto: todavía faltan comentarios de quienes pidieron la cita este semestre.',
    createdAt: '2026-10-09T19:40:00Z',
  },
];

export interface DemoVoteSpec {
  readonly targetType: DemoTargetType;
  /** Cluster + node key for a `NODE` target. */
  readonly targetCluster?: DemoClusterKey;
  readonly targetNode?: DemoNodeKey;
  /** Cluster + relation key for an `EDGE` target. */
  readonly targetEdgeCluster?: DemoClusterKey;
  readonly targetEdgeKey?: string;
  /** Bridge key for a bridge relation. */
  readonly targetBridgeKey?: string;
  /** Proposal key for a `PROPOSAL` target. */
  readonly targetProposal?: string;
  /** Post key for a `POST` target. */
  readonly targetPost?: string;
  readonly by: DevIdentityName;
  readonly interactionType: DemoInteractionType;
  readonly createdAt: string;
}

/**
 * The votes of the three dev identities.
 *
 * The unique index is `(user_hash, target_id, target_type)`: one vote per
 * identity and target, so the same identity never votes twice on the same
 * object.
 *
 * The maintainer — the identity the presenter signs in with — votes on the
 * *relations* only. It never votes on a node, a proposal or a post, so the
 * presenter can still cast a live vote on any of them during the demo
 * (the API answers 409 to a second vote of the same identity).
 */
export const DEMO_VOTES: readonly DemoVoteSpec[] = [
  // --- Cluster 1: movilidad ------------------------------------------------
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-17T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-18T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p2', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-28T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-29T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p3', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-08T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-09T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p4', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-12T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'p4', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-13T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'i1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-20T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'i1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-21T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'i2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-01T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'i3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-17T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'movilidad', targetNode: 'r1', by: 'moderator', interactionType: 'VALIDATE', createdAt: '2026-06-21T08:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'movilidad', targetEdgeKey: 'e1', by: 'maintainer', interactionType: 'SUPPORT', createdAt: '2026-06-19T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'movilidad', targetEdgeKey: 'e1', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-06-22T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'movilidad', targetEdgeKey: 'e4', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-06-28T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'movilidad', targetEdgeKey: 'e10', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-07-01T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'movilidad', targetEdgeKey: 'e11', by: 'moderator', interactionType: 'VALIDATE', createdAt: '2026-06-30T09:00:00Z' },

  // --- Cluster 2: espacios -------------------------------------------------
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-19T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-20T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p2', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-03T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-04T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p3', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-10T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-11T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'p4', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-23T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'i1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-25T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'i1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-26T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'i2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-15T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'i3', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-29T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'i3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-30T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'espacios', targetNode: 'r1', by: 'moderator', interactionType: 'VALIDATE', createdAt: '2026-06-22T08:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'espacios', targetEdgeKey: 'e7', by: 'maintainer', interactionType: 'SUPPORT', createdAt: '2026-06-24T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'espacios', targetEdgeKey: 'e7', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-06-27T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'espacios', targetEdgeKey: 'e10', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-07-28T09:00:00Z' },

  // --- Cluster 3: vida académica ------------------------------------------
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-21T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-22T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p2', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-03T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-04T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p3', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-07-10T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-11T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p4', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-08-12T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'p4', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-08-13T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'i1', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-06-26T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'i1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-06-27T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'i2', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-07-15T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'i3', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-08-07T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'i3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-08-08T08:00:00Z' },
  { targetType: 'NODE', targetCluster: 'academico', targetNode: 'r1', by: 'member', interactionType: 'VALIDATE', createdAt: '2026-07-04T08:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'academico', targetEdgeKey: 'e10', by: 'maintainer', interactionType: 'SUPPORT', createdAt: '2026-08-07T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'academico', targetEdgeKey: 'e10', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-08-08T09:00:00Z' },
  { targetType: 'EDGE', targetEdgeCluster: 'academico', targetEdgeKey: 'e11', by: 'moderator', interactionType: 'VALIDATE', createdAt: '2026-07-05T09:00:00Z' },

  // --- Bridges between the clusters ---------------------------------------
  { targetType: 'EDGE', targetBridgeKey: 'e1', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-08-12T09:00:00Z' },
  { targetType: 'EDGE', targetBridgeKey: 'e2', by: 'maintainer', interactionType: 'SUPPORT', createdAt: '2026-08-13T09:00:00Z' },
  { targetType: 'EDGE', targetBridgeKey: 'e2', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-08-14T09:00:00Z' },

  // --- Proposals -----------------------------------------------------------
  { targetType: 'PROPOSAL', targetProposal: 'PR-CICLO', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-10-12T10:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-CICLO', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-10-12T12:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-AULAS', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-10-03T08:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-AULAS', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-10-03T10:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-BECAS', by: 'moderator', interactionType: 'SUPPORT', createdAt: '2026-08-28T10:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-BECAS', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-08-28T12:00:00Z' },
  { targetType: 'PROPOSAL', targetProposal: 'PR-HISTORIA', by: 'member', interactionType: 'SUPPORT', createdAt: '2026-09-02T10:00:00Z' },

  // --- Discussion posts ----------------------------------------------------
  { targetType: 'POST', targetPost: 'M1', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-10-13T09:35:00Z' },
  { targetType: 'POST', targetPost: 'M2', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-10-13T10:40:00Z' },
  { targetType: 'POST', targetPost: 'M3', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-10-13T12:00:00Z' },
  { targetType: 'POST', targetPost: 'M4', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-10-05T15:00:00Z' },
  { targetType: 'POST', targetPost: 'M4', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-10-05T15:05:00Z' },
  { targetType: 'POST', targetPost: 'M7', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-10-08T18:10:00Z' },
  { targetType: 'POST', targetPost: 'M7', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-10-08T18:20:00Z' },
  { targetType: 'POST', targetPost: 'M8', by: 'member', interactionType: 'UPVOTE', createdAt: '2026-10-09T10:00:00Z' },
  // The member pushes back on the remark about the auto-apply: the post is
  // contested, and the forum shows a downvote.
  { targetType: 'POST', targetPost: 'M9', by: 'moderator', interactionType: 'UPVOTE', createdAt: '2026-10-09T10:30:00Z' },
  { targetType: 'POST', targetPost: 'M9', by: 'member', interactionType: 'DOWNVOTE', createdAt: '2026-10-09T11:00:00Z' },
];

// ---------------------------------------------------------------------------
// The resolved graph (what the seed actually writes)
// ---------------------------------------------------------------------------

export interface ResolvedNode {
  readonly id: string;
  readonly cluster: DemoClusterKey;
  readonly key: DemoNodeKey;
  readonly typeKey: DemoClassKey;
  readonly title: string;
  readonly description: string;
  readonly attributes: Record<string, string | number>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResolvedEdge {
  readonly id: string;
  readonly relationKey: DemoRelationKey;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly createdAt: string;
  /** `true` for the relations that cross two clusters. */
  readonly bridge: boolean;
  /** Cluster the relation is reported under (`null` for a bridge). */
  readonly cluster: DemoClusterKey | null;
  readonly fromCluster: DemoClusterKey;
  readonly toCluster: DemoClusterKey;
}

export interface ResolvedProposal {
  readonly id: string;
  readonly key: string;
  readonly targetId: string;
  readonly targetType: 'NODE';
  readonly kind: 'EDIT';
  readonly proposedChanges: Record<string, unknown>;
  readonly justification: string;
  readonly status: 'PENDING' | 'APPROVED_BY_AUTHOR';
  readonly communityScore: number;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface ResolvedThread {
  readonly id: string;
  readonly key: string;
  readonly targetId: string;
  readonly targetType: 'NODE' | 'PROPOSAL';
  readonly title: string;
  readonly createdBy: DevIdentityName;
  readonly createdAt: string;
}

export interface ResolvedPost {
  readonly id: string;
  readonly key: string;
  readonly threadId: string;
  readonly parentPostId: string | null;
  readonly author: DevIdentityName;
  readonly body: string;
  readonly createdAt: string;
  /** Denormalized counters, derived from the votes of the post. */
  readonly upvotes: number;
  readonly downvotes: number;
  readonly communityScore: number;
}

export interface ResolvedVote {
  readonly id: string;
  readonly targetId: string;
  readonly targetType: DemoTargetType;
  readonly userHash: string;
  readonly interactionType: DemoInteractionType;
  readonly value: number;
  readonly createdAt: string;
}

export interface ResolvedDemoGraph {
  readonly clusters: ReadonlyArray<{
    readonly key: DemoClusterKey;
    readonly label: string;
    readonly summary: string;
    readonly nodes: readonly ResolvedNode[];
    readonly edges: readonly ResolvedEdge[];
  }>;
  readonly nodes: readonly ResolvedNode[];
  readonly edges: readonly ResolvedEdge[];
  readonly proposals: readonly ResolvedProposal[];
  readonly threads: readonly ResolvedThread[];
  readonly posts: readonly ResolvedPost[];
  readonly votes: readonly ResolvedVote[];
}

/** The score delta of an interaction, mirroring the API's `VoteValue`. */
export function voteValue(type: DemoInteractionType): number {
  return type === 'DOWNVOTE' ? -1 : 1;
}

/** One hour after the newest of the two endpoints: a relation follows its nodes. */
function edgeTimestamp(from: string, to: string): string {
  const newest = Math.max(Date.parse(from), Date.parse(to));
  return new Date(newest + 60 * 60 * 1000).toISOString();
}

/**
 * Resolve the declarative specs into the flat, id-carrying lists the seed
 * writes. Pure: the same input always produces the same output.
 */
export function resolveDemoGraph(): ResolvedDemoGraph {
  const nodes: ResolvedNode[] = [];
  const edges: ResolvedEdge[] = [];

  for (const cluster of DEMO_CLUSTERS) {
    for (const node of cluster.nodes) {
      nodes.push({
        id: demoNodeId(cluster.key, node.key),
        cluster: cluster.key,
        key: node.key,
        typeKey: node.typeKey,
        title: node.title,
        description: node.description,
        attributes: { ...node.attributes },
        createdAt: node.createdAt,
        updatedAt: node.updatedAt ?? node.createdAt,
      });
    }

    for (const edge of cluster.edges) {
      const from = cluster.nodes.find((node) => node.key === edge.from);
      const to = cluster.nodes.find((node) => node.key === edge.to);
      if (!from || !to) {
        throw new Error(`unknown node in the relation ${edge.key} of ${cluster.key}`);
      }
      edges.push({
        id: demoEdgeId(cluster.key, edge.key),
        relationKey: edge.relationKey,
        fromNodeId: demoNodeId(cluster.key, edge.from),
        toNodeId: demoNodeId(cluster.key, edge.to),
        createdAt: edgeTimestamp(from.createdAt, to.createdAt),
        bridge: false,
        cluster: cluster.key,
        fromCluster: cluster.key,
        toCluster: cluster.key,
      });
    }
  }

  for (const bridge of DEMO_BRIDGES) {
    const fromCluster = DEMO_CLUSTERS.find((c) => c.key === bridge.fromCluster);
    const toCluster = DEMO_CLUSTERS.find((c) => c.key === bridge.toCluster);
    const from = fromCluster?.nodes.find((node) => node.key === bridge.from);
    const to = toCluster?.nodes.find((node) => node.key === bridge.to);
    if (!from || !to || !fromCluster || !toCluster) {
      throw new Error(`unknown node in the bridge ${bridge.key}`);
    }
    edges.push({
      id: demoBridgeId(bridge.key),
      relationKey: bridge.relationKey,
      fromNodeId: demoNodeId(bridge.fromCluster, bridge.from),
      toNodeId: demoNodeId(bridge.toCluster, bridge.to),
      createdAt: edgeTimestamp(from.createdAt, to.createdAt),
      bridge: true,
      cluster: null,
      fromCluster: bridge.fromCluster,
      toCluster: bridge.toCluster,
    });
  }

  const proposals: ResolvedProposal[] = DEMO_PROPOSALS.map((proposal) => ({
    id: demoProposalId(proposal.key),
    key: proposal.key,
    targetId: demoNodeId(proposal.cluster, proposal.targetNode),
    targetType: 'NODE',
    kind: 'EDIT',
    proposedChanges: { ...proposal.proposedChanges },
    justification: proposal.justification,
    status: proposal.status,
    communityScore: proposal.communityScore,
    createdAt: proposal.createdAt,
    resolvedAt: proposal.resolvedAt ?? null,
  }));

  const threads: ResolvedThread[] = DEMO_THREADS.map((thread) => {
    const targetId =
      thread.targetType === 'PROPOSAL'
        ? demoProposalId(thread.targetProposal ?? '')
        : demoNodeId(thread.targetCluster ?? 'movilidad', thread.targetNode ?? 'p1');
    return {
      id: demoThreadId(thread.key),
      key: thread.key,
      targetId,
      targetType: thread.targetType,
      title: thread.title,
      createdBy: thread.createdBy,
      createdAt: thread.createdAt,
    };
  });

  // --- The votes, resolved to concrete targets ----------------------------
  const edgeIdOf = (cluster: DemoClusterKey, key: string): string => demoEdgeId(cluster, key);
  const votes: ResolvedVote[] = [];
  let voteIndex = 0;

  for (const vote of DEMO_VOTES) {
    let targetId = '';
    switch (vote.targetType) {
      case 'NODE':
        targetId = demoNodeId(vote.targetCluster ?? 'movilidad', vote.targetNode ?? 'p1');
        break;
      case 'EDGE':
        targetId =
          vote.targetBridgeKey !== undefined
            ? demoBridgeId(vote.targetBridgeKey)
            : edgeIdOf(vote.targetEdgeCluster ?? 'movilidad', vote.targetEdgeKey ?? 'e1');
        break;
      case 'PROPOSAL':
        targetId = demoProposalId(vote.targetProposal ?? 'PR-CICLO');
        break;
      case 'POST':
        targetId = demoPostId(vote.targetPost ?? 'M1');
        break;
    }

    voteIndex += 1;
    votes.push({
      id: demoUuid(VOTE_UUID_PREFIX, voteIndex),
      targetId,
      targetType: vote.targetType,
      userHash: authorHashFor(vote.by),
      interactionType: vote.interactionType,
      value: voteValue(vote.interactionType),
      createdAt: vote.createdAt,
    });
  }

  // The counters of a post are the votes of that post.
  const posts: ResolvedPost[] = DEMO_POSTS.map((post) => {
    const id = demoPostId(post.key);
    const own = votes.filter((vote) => vote.targetType === 'POST' && vote.targetId === id);
    return {
      id,
      key: post.key,
      threadId: demoThreadId(post.threadKey),
      parentPostId: post.parentPostKey === null ? null : demoPostId(post.parentPostKey),
      author: post.author,
      body: post.body,
      createdAt: post.createdAt,
      upvotes: own.filter((vote) => vote.interactionType === 'UPVOTE').length,
      downvotes: own.filter((vote) => vote.interactionType === 'DOWNVOTE').length,
      communityScore: own.reduce((total, vote) => total + vote.value, 0),
    };
  });

  return {
    clusters: DEMO_CLUSTERS.map((cluster) => ({
      key: cluster.key,
      label: cluster.label,
      summary: cluster.summary,
      nodes: nodes.filter((node) => node.cluster === cluster.key),
      edges: edges.filter((edge) => edge.cluster === cluster.key),
    })),
    nodes,
    edges,
    proposals,
    threads,
    posts,
    votes,
  };
}
