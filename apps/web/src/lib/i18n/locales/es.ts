/**
 * The Spanish dictionary — the source of truth of the interface copy.
 *
 * The nested shape is the shape of the interface: one section per screen
 * and per component. The keys are the **dotted paths** of that shape
 * (`login.title`, `graph.canvas.bound`, …) and they are what `t()` takes.
 *
 * The copy is written in the register of a university: formal, direct and
 * free of the Anglicisms that a machine translation would leave behind. The
 * seeded content is **not** translated here — it is data, and it stays as
 * the API sends it.
 *
 * The English dictionary (`./en`) must have exactly these keys: it is
 * declared as `Dictionary<typeof es>`, so a missing key, a misspelled key or
 * a leftover key is a compile error.
 */

export const es = {
  /** The copy several screens share. */
  common: {
    cancel: 'Cancelar',
    close: 'Cerrar',
    loading: 'Cargando…',
    all: 'Todos',
    required: '(obligatorio)',
    optional: '(opcional)',
    tryAgain: 'Intentar de nuevo',
    joinWithCode: 'Unirse con un código de evento',
    emptyValue: '—'
  },

  /** The shell: the skip link, the header and the footer. */
  shell: {
    skipToContent: 'Saltar al contenido',
    footer: 'VozLab — cliente de co-creación para el grafo de conocimiento.'
  },

  /** The sidebar: the sections, the identity and the sign-out. */
  sidebar: {
    sectionsLabel: 'Secciones',
    graph: 'Grafo',
    proposals: 'Propuestas',
    discussions: 'Debates',
    signedInAs: 'Sesión iniciada como',
    signedInFallback: 'Sesión iniciada',
    signOut: 'Cerrar sesión',
    signingOut: 'Cerrando sesión…',
    signOutFailed: 'No se pudo cerrar la sesión.'
  },

  /** The selector of the workspace. */
  workspace: {
    label: 'Espacio de trabajo',
    yourRole: 'Tu rol aquí:',
    noneSelected: 'No hay ningún espacio de trabajo seleccionado.'
  },

  /** The selector of the language. */
  locale: {
    label: 'Idioma',
    /** The name of every language is written in that language. */
    es: 'Español',
    en: 'English'
  },

  /** The sign-in screen and the development sign-in. */
  login: {
    pageTitle: 'Iniciar sesión — VozLab',
    heading: 'Iniciar sesión en VozLab',
    intro:
      'VozLab no guarda contraseñas. El proveedor de identidad de tu institución te autentica y devuelve una sesión a esta aplicación; la aplicación solo llega a ver la sesión.',
    continue: 'Continuar con tu institución',
    continueHelp:
      'El navegador lleva al proveedor de identidad y vuelve aquí cuando ha terminado.',
    joiningHeading: '¿Vas a participar en un evento?',
    joiningText:
      'Un código de evento es una credencial de un solo uso para un único espacio de trabajo. No necesita cuenta ni proveedor de identidad.',
    devHeading: 'Acceso de desarrollo',
    devText:
      'Un código de evento concede el rol `MEMBER`, y un miembro no puede ni aprobar una propuesta ni aplicarla automáticamente. Pega un token generado localmente para actuar como una de las identidades de desarrollo — quien mantiene el grafo sembrado es su autor, así que es la persona que puede aprobar sus propuestas.',
    devTokenLabel: 'Token de desarrollo',
    devSubmit: 'Entrar con esta identidad',
    devSigningIn: 'Entrando…',
    devPreparing: 'Preparando el formulario…',
    devErrorInvalidToken:
      'Esto no es un token Bearer. Genera uno con db:mint-token y pega el valor entero.',
    devErrorRejected:
      'La API rechazó el token: ha caducado, se ha revocado o no es válido.',
    devErrorUnreachable: 'No se pudo contactar con la API.',
    devTokenNote:
      'El token se queda en memoria. Nunca se escribe en el almacenamiento del navegador, y este panel solo existe en una compilación de desarrollo.',
    devCommandsLabel: 'Los comandos que generan una sesión de desarrollo',
    localHeading: 'Desarrollo local',
    localText:
      'Sin un proveedor de identidad no hay ningún acceso al que redirigir. Genera en su lugar una sesión de desarrollo para la API y úsala como token Bearer:',
    localCommandLabel: 'El comando que genera un token de desarrollo',
    localNote:
      'Ese token pertenece a la API (scripts, workers, `curl`). La aplicación en sí necesita un proveedor de identidad o un código de evento.',
    localRunbook: 'El runbook describe el flujo completo: `docs/runbook-dev.md`.'
  },

  /** The join of an event with a code. */
  join: {
    pageTitle: 'Unirse a un evento — VozLab',
    heading: 'Unirse a un evento',
    intro:
      'Escribe el código que ha compartido quien coordina. El código es toda la credencial: no hay escaneo con la cámara, ni cuenta, ni proveedor de identidad. Basta con un campo de texto.',
    codeLabel: 'Código del evento',
    codeHelp: 'Entre 16 y 128 caracteres, tal y como se compartió.',
    aliasLabel: 'Nombre visible',
    aliasHelp:
      'El nombre que ven las demás personas participantes. Déjalo vacío para conservar el anonimato.',
    submit: 'Unirse al evento',
    submitting: 'Uniéndose…',
    preparing: 'Preparando el formulario…',
    noMembership:
      'El evento no concedió ninguna pertenencia a un espacio de trabajo de esta institución. Pide a quien lo coordina el código de un espacio al que puedas unirte.',
    failed: 'No se pudo unirse al evento.',
    signInInstead: '¿Prefieres entrar con tu institución?',
    signInLink: 'Iniciar sesión'
  },

  /** The landing of a refused institutional login. */
  callback: {
    pageTitle: 'El acceso no se completó — VozLab',
    heading: 'El acceso no se completó',
    genericMessage:
      'No se pudo completar el acceso. El proveedor de identidad no aceptó la solicitud.'
  },

  /** The shell of the application: the guard and the empty states. */
  app: {
    workspaceAndSections: 'Espacio de trabajo y secciones',
    noWorkspaceHeading: 'No hay ningún espacio de trabajo en esta institución',
    noWorkspaceText:
      'Tu cuenta es válida, pero no eres miembro de ningún espacio de trabajo de esta institución. Pide a un administrador que te añada a uno, o únete a un evento con un código.',
    restoreFailedHeading: 'No se pudo restaurar la sesión',
    restoreFailedOffline:
      'El navegador está sin conexión: la sesión necesita la red para restaurarse. Las páginas que requieren el servidor no se pueden cargar hasta que vuelva la conexión.',
    restoring: 'Restaurando tu sesión…'
  },

  /** The graph screen: the root picker, the canvas, the list and the panel. */
  graph: {
    pageTitle: 'Grafo — VozLab',
    heading: 'Grafo',
    intro:
      'El lienzo dibuja un subgrafo **acotado**: como máximo {maxNodes} nodos y {maxDepth} saltos desde la raíz. Todo el contenido aparece también en la lista de debajo del lienzo, porque un lienzo es una imagen que un lector de pantalla no puede ver.',
    newNode: 'Nuevo nodo',
    readingOntology: 'Leyendo la ontología…',
    nodeCreated: 'El nodo «{title}» se ha creado y está pendiente de revisión.',
    edgeCreated:
      'La relación «{relationKey}» se ha creado y está pendiente de revisión.',
    correctionSubject: 'La corrección',
    nodeCorrectionSubject: 'La corrección del nodo «{title}»',
    edgeCorrectionSubject: 'La corrección de la relación «{relationKey}»',
    proposalCreated:
      '{subject} se ha propuesto. Queda pendiente: decide la persona autora del objetivo, y nada cambia hasta que lo haga.',
    openProposal: 'Abrir la propuesta',
    rootHeading: 'Nodo raíz',
    rootHelp:
      'Los nodos más recientes de este espacio de trabajo. Elige uno para dibujar el subgrafo a su alrededor.',
    loadingNodes: 'Cargando los nodos…',
    noNodes:
      'Este espacio de trabajo todavía no tiene ningún nodo. No se puede dibujar nada hasta que exista uno.',
    showOlderNodes: 'Mostrar nodos anteriores',
    subgraphHeading: 'Subgrafo',
    depthLabel: 'Profundidad',
    maxNodesLabel: 'Máx. nodos',
    bounds:
      'Profundidad {depth} · hasta {limit} nodos. La API acota la ventana a {maxDepth} saltos y {maxNodes} nodos: esto es una ventana del grafo, no el grafo entero.',
    staleGraph: 'El subgrafo de abajo es el que se cargó por última vez.',
    pickRoot:
      'Elige un nodo raíz arriba para dibujar el subgrafo a su alrededor.',
    loadingSubgraph: 'Cargando el subgrafo…',
    canvasLabel: 'Lienzo del subgrafo',
    canvasDefaultDescription:
      'El subgrafo está dibujado en un lienzo; el mismo contenido aparece en la lista de debajo.',
    canvasDescription:
      '{nodes} nodos y {edges} relaciones en el subgrafo alrededor de la raíz elegida, dibujados con una disposición dagre determinista.',
    nodeDetailsHeading: 'Detalles del nodo',
    apiOrigin: 'El grafo se lee de `{apiBaseUrl}`.',
    listSummary: 'El subgrafo en forma de lista',
    listNodesHeading: 'Nodos del subgrafo',
    listNodesCaption:
      'Los nodos del subgrafo: título, clase de la ontología y estado.',
    listNodesRegion: 'Los nodos del subgrafo',
    listRelationsHeading: 'Relaciones del subgrafo',
    listRelationsCaption:
      'Las relaciones del subgrafo: clave de relación, extremos, estado y puntuación.',
    listRelationsRegion: 'Las relaciones del subgrafo',
    listNoNodes: 'El subgrafo no tiene ningún nodo.',
    listNoRelations: 'El subgrafo no tiene ninguna relación.',
    unknownNode: 'Nodo desconocido',
    columnTitle: 'Título',
    columnType: 'Tipo',
    columnStatus: 'Estado',
    columnRelation: 'Relación',
    columnFrom: 'Origen',
    columnTo: 'Destino',
    columnScore: 'Puntuación',
    columnCorrection: 'Corrección',
    suggestCorrection: 'Proponer una corrección',
    suggestCorrectionOfRelation:
      'Proponer una corrección de la relación {relationKey}',
    voteRelationLabel: 'la relación {relationKey}'
  },

  /** The node: its form, its details and its history. */
  node: {
    newNodeTitle: 'Nuevo nodo',
    createIntro:
      'Los campos vienen de la ontología activa de este espacio de trabajo. El nodo se crea **pendiente**: la comunidad lo revisa antes de que entre en el grafo.',
    loadingOntology: 'Cargando la ontología…',
    noActiveClass:
      'Este espacio de trabajo no tiene ninguna clase activa: no hay nada con lo que crear un nodo.',
    ontologyClass: 'Clase de la ontología',
    titleLabel: 'Título',
    descriptionLabel: 'Descripción',
    attributesOf: 'Atributos de {label}',
    noActiveAttributes:
      'Esta clase no declara ningún atributo activo: el nodo es solo un título y una descripción.',
    notShownHeading: 'No se muestra en este formulario',
    skippedExplanation:
      '{label}: la ontología vuelve a declarar un campo del propio nodo, así que el valor se pide una sola vez, en el campo de arriba.',
    formProblem: 'El formulario tiene {count} problema.',
    formProblems: 'El formulario tiene {count} problemas.',
    formKept:
      'El formulario conserva lo que has escrito: no se ha creado nada.',
    creating: 'Creando…',
    createSubmit: 'Crear el nodo',
    selectPrompt:
      'Selecciona un nodo en el lienzo o en la lista para ver sus detalles.',
    noDescription: 'Sin descripción.',
    relate: 'Relacionar con otro nodo',
    suggestCorrectionLabel: 'Proponer una corrección del nodo {title}',
    discuss: 'Debatir este nodo',
    communityScore: 'Puntuación de la comunidad',
    author: 'Autoría',
    created: 'Creado',
    attributesHeading: 'Atributos de la ontología',
    noAttributes: 'Este nodo no lleva ningún atributo.',
    proposalHistoryHeading: 'Historial de propuestas de edición',
    loadingProposals: 'Cargando las propuestas…',
    noProposals: 'Ninguna propuesta apunta a este nodo.',
    historyTruncated:
      'Este historial es **parcial**: la API devolvió una página acotada de las propuestas del espacio de trabajo y hay más allá. La API no puede filtrar por objetivo, así que el historial de este nodo se filtra a partir de esa página.',
    status: 'Estado'
  },

  /** The relation: its form. */
  edge: {
    relateTitle: 'Relacionar dos nodos',
    intro:
      'Una relación se crea **pendiente**: la comunidad la revisa antes de que entre en el grafo. Solo se ofrecen las relaciones que la ontología permite para este nodo.',
    pickSource:
      'Elige un nodo en el lienzo o en la lista antes de relacionarlo con otro.',
    noRelation:
      'La ontología activa no declara ninguna relación cuyo dominio sea {typeKey}: todavía no hay nada con lo que relacionar este nodo.',
    from: 'Origen',
    fromClass: 'de',
    toClass: 'a',
    relationLabel: 'Relación',
    toLabel: 'Destino',
    pickTarget: 'Elige el nodo al que apunta la relación.',
    noTarget:
      'No existe ningún nodo de la clase de rango {range} en este espacio de trabajo: crea uno primero.',
    willPointAt: 'La relación apuntará a {title}.',
    candidates:
      'Los candidatos son los {count} nodos del espacio de trabajo que tiene la lista de arriba.',
    formKept:
      'El formulario conserva lo que has escrito: no se ha creado nada.',
    creating: 'Creando…',
    createSubmit: 'Crear la relación'
  },

  /** The correction: the form of the proposal and its diff. */
  correction: {
    title: 'Proponer una corrección',
    intro:
      'Una propuesta es un diff: no cambia **nada** hasta que la persona autora del objetivo la aprueba. La propuesta se crea **pendiente** — decide la persona autora del objetivo.',
    pickTarget:
      'Elige un nodo o una relación antes de proponer una corrección.',
    readingTarget: 'Leyendo el objetivo…',
    loadingTarget: 'Cargando el objetivo…',
    emptyDescription: 'Una descripción vacía borra el texto del nodo.',
    relationKeyLabel: 'Clave de la relación',
    attributesLegend: 'Atributos',
    attributesNote:
      'La API fusiona los atributos con los del objetivo: una propuesta puede cambiar un atributo y añadir otro, pero no puede quitarlo ni renombrarlo. Una fila sin valor no se envía.',
    noAttributes: 'El objetivo no lleva ningún atributo.',
    keyLabel: 'Clave del atributo {index}',
    valueLabel: 'Valor del atributo {index}',
    typeLabel: 'Tipo del atributo {index}',
    kept: 'Se conserva',
    remove: 'Quitar',
    removeLabel: 'Quitar el atributo {index}',
    notEditable:
      'Este valor no es un texto, un número ni un booleano: el formulario no puede proponer un cambio para él.',
    changesHeading: 'Qué cambia esta propuesta',
    noChanges:
      'Todavía no cambia nada: el formulario no envía nada hasta que un campo difiera del objetivo.',
    oneChange: 'Cambia un campo.',
    manyChanges: 'Cambian {count} campos.',
    tableCaption:
      'El valor actual y el valor propuesto de cada campo del objetivo.',
    columnField: 'Campo',
    columnCurrent: 'Actual',
    columnProposed: 'Propuesto',
    columnChange: 'Cambio',
    changes: 'Cambia',
    unchanged: 'Sin cambios',
    justificationLabel: 'Justificación',
    justificationHelp:
      'Por qué se propone la corrección — quien mantiene el objetivo la lee.',
    formProblem: 'El formulario tiene {count} problema.',
    formProblems: 'El formulario tiene {count} problemas.',
    nothingToPropose:
      'Esta propuesta no cambia nada: cambia un campo antes de enviarla.',
    formKept:
      'El formulario conserva lo que has escrito: no se ha propuesto nada.',
    proposing: 'Proponiendo…',
    proposeSubmit: 'Proponer la corrección',
    fieldTitle: 'Título',
    fieldDescription: 'Descripción',
    fieldRelationKey: 'Clave de la relación',
    attributeField: 'Atributo «{key}»',
    addAttribute: 'Añadir un atributo',
    typeText: 'Texto',
    typeNumber: 'Número',
    typeCheckbox: 'Casilla'
  },

  /** The proposals screen: the filters, the list and the review. */
  proposals: {
    pageTitle: 'Propuestas — VozLab',
    heading: 'Propuestas',
    intro:
      'Las solicitudes de conocimiento del espacio de trabajo: abre una para ver el cambio propuesto, debatidlo y votadlo. El espacio de trabajo activo lo lleva una cabecera de la petición, no la URL: la ruta sigue siendo `/proposals`.',
    filtersHeading: 'Filtros',
    filterStatus: 'Estado',
    filterTarget: 'Objetivo',
    filterKind: 'Tipo',
    statusPending: 'Pendiente',
    statusApproved: 'Aprobada por la autoría',
    statusRejected: 'Rechazada por la autoría',
    statusAutoApplied: 'Aplicada automáticamente',
    targetNode: 'Nodo',
    targetRelation: 'Relación',
    targetOntology: 'Clase de la ontología',
    kindEdit: 'Edición',
    kindMerge: 'Fusión',
    nounNode: 'nodo',
    nounRelation: 'relación',
    nounOntology: 'clase de la ontología',
    listHeading: 'Las propuestas del espacio de trabajo',
    listRegion: 'Las propuestas del espacio de trabajo',
    listCaption:
      'Las propuestas del espacio de trabajo: tipo y objetivo, estado, puntuación de la comunidad y fecha de creación.',
    columnProposal: 'Propuesta',
    columnStatus: 'Estado',
    columnScore: 'Puntuación',
    columnCreated: 'Creada',
    editProposalOf: 'Propuesta de edición de {target}',
    mergeProposalOf: 'Propuesta de fusión de {target}',
    loading: 'Cargando las propuestas…',
    none:
      'Ninguna propuesta coincide con estos filtros en este espacio de trabajo.',
    showOlder: 'Mostrar propuestas anteriores',
    detailHeading: 'La propuesta en revisión',
    pickProposal:
      'Elige una propuesta de la lista para ver el cambio propuesto, su debate y los controles de su resolución.',
    mergeProposal: 'Propuesta de fusión',
    editProposal: 'Propuesta de edición',
    target: 'Objetivo',
    author: 'Autoría',
    created: 'Creada',
    resolved: 'Resuelta',
    daysAgo: 'hace {count} días',
    proposedChange: 'Cambio propuesto',
    voteHeading: 'Votación',
    resolutionHeading: 'Resolución',
    nowStatus: 'La propuesta está ahora en {status}.',
    readingTarget: 'Leyendo el objetivo de la propuesta…',
    notOpen: 'Esta propuesta está en {status}: no está abierta a resolución.',
    approve: 'Aprobar',
    reject: 'Rechazar',
    autoApply: 'Aplicar automáticamente',
    belongsToMaintainer:
      'Resolver una propuesta corresponde a quien mantiene su objetivo.',
    autoApplyBlocked:
      'La aplicación automática no está disponible: {reason}',
    autoApplyBlockedScore:
      'la puntuación de la comunidad está por debajo de {score}.',
    autoApplyBlockedAge: 'la propuesta tiene menos de {days} días.',
    autoApplyBlockedRole:
      'el rol en este espacio de trabajo no es de moderación ni de administración.',
    autoApplyBlockedClosed: 'la propuesta no está abierta.',
    discussionHeading: 'Debate de esta propuesta'
  },

  /** The delta of a proposal. */
  delta: {
    mergeInto:
      'Esta propuesta fusiona el objetivo con el nodo que sobrevive,',
    nodeBelow: 'el nodo de abajo',
    noSurvivor:
      'La carga útil de esta propuesta de fusión no nombra ningún nodo que sobrevive ({reason}).',
    noChange: 'Esta propuesta no lleva ningún cambio.'
  },

  /** The discussions screen. */
  discussions: {
    pageTitle: 'Debates — VozLab',
    heading: 'Debates',
    intro:
      'Un debate es siempre sobre algo: un nodo, una relación, una propuesta o una clase de la ontología. El objetivo se nombra en la cadena de consulta; el espacio de trabajo activo lo lleva una cabecera de la petición, no la URL.',
    targetHeading: 'Objetivo',
    kindLabel: 'Tipo de objeto',
    targetNode: 'Nodo',
    targetRelation: 'Relación',
    targetProposal: 'Propuesta',
    targetOntology: 'Clase de la ontología',
    identifierLabel: 'Identificador',
    identifierPlaceholder: 'El uuid del objeto',
    show: 'Mostrar el debate',
    pickNode: 'O elige un nodo del espacio de trabajo',
    noNodePicked: 'Ningún nodo elegido',
    pickTarget:
      'Elige un objetivo arriba para leer sus hilos. El panel de detalles del nodo enlaza aquí con el nodo ya elegido.',
    threadsHeading: 'Hilos del objetivo'
  },

  /** The panel of a discussion. */
  discussion: {
    heading: 'Debate',
    titleTooShort: 'El título debe tener al menos 3 caracteres.',
    emptyReply: 'Una respuesta no puede estar vacía.',
    threadOpened: 'Se ha abierto el hilo «{title}».',
    commentPosted: 'Tu comentario se ha publicado.',
    replyPosted: 'Tu respuesta se ha publicado.',
    threadClosed: 'Se ha cerrado el hilo «{title}».',
    commentDeleted: 'El comentario se ha eliminado.',
    newThread: 'Hilo nuevo',
    newThreadPlaceholder: '¿Qué quieres que debata la comunidad?',
    opening: 'Abriendo…',
    startThread: 'Abrir el hilo',
    loadingThreads: 'Cargando los hilos…',
    noThreads: 'Todavía ningún hilo debate este objeto.',
    closedSuffix: '· cerrado',
    threadClosedLabel: 'Hilo cerrado',
    closeThread: 'Cerrar el hilo',
    showOlderThreads: 'Mostrar hilos anteriores',
    commentsOf: 'Comentarios de «{title}»',
    loadingComments: 'Cargando los comentarios…',
    noComments: 'Este hilo todavía no tiene ningún comentario.',
    showOlderComments: 'Mostrar comentarios anteriores',
    writeComment: 'Escribe un comentario',
    writeReply: 'Escribe una respuesta',
    replyingTo: 'Respondiendo a «{body}»',
    cancelReply: 'Cancelar la respuesta',
    commentPlaceholder: 'Tu comentario…',
    posting: 'Publicando…',
    postComment: 'Publicar el comentario',
    postReply: 'Publicar la respuesta',
    reply: 'Responder',
    delete: 'Eliminar'
  },

  /** The vote buttons. */
  vote: {
    thisItem: 'este elemento',
    thisProposal: 'esta propuesta',
    thisComment: 'este comentario',
    onLabel: 'Votar sobre {label}',
    upvote: 'Votar a favor de {label}',
    downvote: 'Votar en contra de {label}',
    score: 'Puntuación',
    alreadyCounted: 'Tu voto ya estaba contado: la puntuación no cambia.',
    recorded: 'Tu voto se ha registrado. La puntuación ahora es {score}.',
    rejectedTitle: 'El voto se ha rechazado'
  },

  /** The banner of the offline mode. */
  offline: {
    heading: 'Estás sin conexión.',
    text:
      'Puedes seguir leyendo lo que ya está cargado, pero crear, editar, votar y resolver están bloqueados hasta que vuelva la conexión. Mientras tanto no se encola nada.'
  },

  /** The offer of the installation. */
  install: {
    message:
      'VozLab se puede instalar en este dispositivo y abrir en su propia ventana.',
    action: 'Instalar VozLab'
  },

  /** The state of the PWA itself. */
  pwa: {
    errorTitle: 'No se ha podido activar el soporte sin conexión',
    errorHint:
      'La aplicación sigue funcionando, pero no estará disponible sin conexión.',
    offlineReady:
      'VozLab está listo para funcionar sin conexión: la aplicación está en la caché de este dispositivo.',
    dismiss: 'Entendido'
  },

  /** The pending service-worker update. */
  update: {
    available: 'Hay una nueva versión de VozLab.',
    reload: 'Recargar ahora'
  },

  /** The messages the client itself produces. */
  errors: {
    offline:
      'El navegador está sin conexión: la petición no se ha enviado. Esta acción necesita la red.',
    unexpected: 'La petición ha fallado.'
  },

  /**
   * The messages of the validation.
   *
   * The validators are pure modules: they answer with the **key** of the
   * message and its values, and the screen renders it with `t()`. The copy
   * therefore lives here and nowhere else.
   */
  validation: {
    titleTooShort: 'El título debe tener al menos {min} caracteres.',
    titleTooLong: 'El título debe tener como máximo {max} caracteres.',
    titleLength: 'El título debe tener entre {min} y {max} caracteres.',
    relationKeyLength:
      'La clave de la relación debe tener entre {min} y {max} caracteres.',
    justificationTooLong:
      'La justificación debe tener como máximo {max} caracteres.',
    attributeRequired: 'Este atributo es obligatorio.',
    attributeMustBeText: 'Este atributo debe ser un texto.',
    attributeMustBeNumber: 'Este atributo debe ser un número.',
    attributeMustBeBoolean: 'Este atributo debe ser verdadero o falso.',
    attributeMustBeDate: 'Este atributo debe ser una fecha (AAAA-MM-DD).',
    attributeHasNoAllowedValue: 'Este atributo no admite ningún valor.',
    attributeMustBeOneOf: 'Este atributo debe ser uno de estos: {allowed}.',
    attributeUnknownKind: 'Este atributo tiene un tipo desconocido.',
    duplicateAttributeKey: 'Dos filas llevan la misma clave.',
    attributeCannotBeEmptied:
      'Un atributo existente no puede quedar vacío: la API fusiona los atributos, no puede quitar ninguno.'
  }
} as const;
