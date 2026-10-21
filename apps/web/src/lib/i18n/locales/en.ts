/**
 * The English dictionary.
 *
 * It is declared as `Dictionary<typeof es>`: the shape is the one of the
 * Spanish dictionary and the values are widened to `string`. A missing key,
 * a misspelled key or a leftover key is therefore a **compile error** — the
 * two dictionaries cannot drift apart.
 *
 * The English copy is the one that was there before the translation: it
 * moved into the dictionary, it did not change.
 */

import type { Dictionary } from '../dictionary';
import { es } from './es';

export const en: Dictionary<typeof es> = {
  common: {
    cancel: 'Cancel',
    close: 'Close',
    loading: 'Loading…',
    all: 'All',
    required: '(required)',
    optional: '(optional)',
    tryAgain: 'Try again',
    joinWithCode: 'Join with an event code',
    emptyValue: '—'
  },

  shell: {
    skipToContent: 'Skip to content',
    openMenu: 'Open the navigation menu',
    footer: 'VozLab — co-creation client for the knowledge graph.'
  },

  drawer: {
    label: 'Navigation menu',
    heading: 'Navigation',
    close: 'Close the navigation menu'
  },

  sheet: {
    label: 'Inspector',
    heading: 'Inspector',
    close: 'Close the inspector'
  },

  sidebar: {
    sectionsLabel: 'Sections',
    graph: 'Graph',
    proposals: 'Proposals',
    discussions: 'Discussions',
    signedInAs: 'Signed in as',
    signedInFallback: 'Signed in',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutFailed: 'The sign-out failed.'
  },

  workspace: {
    label: 'Workspace',
    yourRole: 'Your role here:',
    noneSelected: 'No workspace selected.'
  },

  locale: {
    label: 'Language',
    es: 'Español',
    en: 'English'
  },

  login: {
    pageTitle: 'Sign in — VozLab',
    heading: 'Sign in to VozLab',
    intro:
      'VozLab does not keep passwords. Your institution\'s identity provider authenticates you and hands a session back to this app; the app only ever sees the session.',
    continue: 'Continue with your institution',
    continueHelp:
      'The browser is sent to the identity provider and returns here when it is done.',
    joiningHeading: 'Joining an event?',
    joiningText:
      'An event code is a one-off credential for a single workspace. It needs no account and no identity provider.',
    devHeading: 'Development sign-in',
    devText:
      'An event code grants the `MEMBER` role, and a member can neither approve a proposal nor auto-apply one. Paste a token minted locally to act as one of the dev identities — the maintainer is the author of the seeded graph, so it is the one who can approve its proposals.',
    devTokenLabel: 'Development token',
    devSubmit: 'Sign in as this identity',
    devSigningIn: 'Signing in…',
    devPreparing: 'Preparing the form…',
    devErrorInvalidToken:
      'That is not a bearer token. Mint one with db:mint-token and paste the whole value.',
    devErrorRejected:
      'The API rejected the token: it is expired, revoked or not valid.',
    devErrorUnreachable: 'The API could not be reached.',
    devTokenNote:
      'The token stays in memory. It is never written to the browser\'s storage, and this panel exists only in a development build.',
    devCommandsLabel: 'The commands that mint a development session',
    localHeading: 'Local development',
    localText:
      'Without an identity provider there is no sign-in to redirect to. Mint a development session for the API instead and use it as the bearer token:',
    localCommandLabel: 'The command that mints a development token',
    localNote:
      'That token belongs to the API (scripts, workers, `curl`). The app itself needs an identity provider or an event code.',
    localRunbook: 'The runbook describes the whole flow: `docs/runbook-dev.md`.'
  },

  join: {
    pageTitle: 'Join an event — VozLab',
    heading: 'Join an event',
    intro:
      'Type the code your facilitator shared. The code is the whole credential: there is no camera scan, no account and no identity provider involved. A text field is all it takes.',
    codeLabel: 'Event code',
    codeHelp: 'Between 16 and 128 characters, exactly as it was shared.',
    aliasLabel: 'Display name',
    aliasHelp:
      'The name the other participants see. Leave it empty to stay anonymous.',
    submit: 'Join the event',
    submitting: 'Joining…',
    preparing: 'Preparing the form…',
    noMembership:
      'The event did not grant a workspace membership in this institution. Ask the organiser for a code of a workspace you can join.',
    failed: 'The event could not be joined.',
    signInInstead: 'Signing in with your institution instead?',
    signInLink: 'Sign in'
  },

  callback: {
    pageTitle: 'The sign-in did not go through — VozLab',
    heading: 'The sign-in did not go through',
    genericMessage:
      'The sign-in could not be completed. The identity provider did not accept the request.'
  },

  app: {
    workspaceAndSections: 'Workspace and sections',
    noWorkspaceHeading: 'No workspace in this institution',
    noWorkspaceText:
      'Your account is valid, but it is not a member of any workspace of this institution. Ask an administrator to add you to one, or join an event with a code.',
    restoreFailedHeading: 'The session could not be restored',
    restoreFailedOffline:
      'The browser is offline: the session needs the network to be restored. The pages that need the server cannot be loaded until the connection is back.',
    restoring: 'Restoring your session…'
  },

  graph: {
    pageTitle: 'Graph — VozLab',
    heading: 'Graph',
    intro:
      'The canvas draws a **bounded** subgraph: at most {maxNodes} nodes and {maxDepth} hops from the root. The “List” switch shows the same content as text, because a canvas is a picture a screen reader cannot see.',
    toolbarLabel: 'The tools of the graph',
    listToggle: 'List',
    rootToggle: 'Root',
    rootPanelLabel: 'The root node of the subgraph',
    newNode: 'New node',
    readingOntology: 'Reading the ontology…',
    nodeCreated: 'The node “{title}” was created and is pending review.',
    edgeCreated: 'The relation “{relationKey}” was created and is pending review.',
    correctionSubject: 'The correction',
    nodeCorrectionSubject: 'The correction of the node “{title}”',
    edgeCorrectionSubject: 'The correction of the relation “{relationKey}”',
    proposalCreated:
      '{subject} was proposed. It is pending: the author of the target decides, and nothing changes until they do.',
    openProposal: 'Open the proposal',
    rootHeading: 'Root node',
    rootHelp:
      'The newest nodes of this workspace. Pick one to draw the subgraph around it.',
    loadingNodes: 'Loading the nodes…',
    noNodes:
      'This workspace has no node yet. Nothing can be drawn until one exists.',
    showOlderNodes: 'Show older nodes',
    subgraphHeading: 'Subgraph',
    depthLabel: 'Depth',
    maxNodesLabel: 'Max. nodes',
    bounds:
      'Depth {depth} · up to {limit} nodes. The API caps the window at {maxDepth} hops and {maxNodes} nodes: this is a window on the graph, not the whole graph.',
    staleGraph: 'The subgraph on the canvas is the one that was loaded last.',
    pickRoot: 'Pick a root node to draw the subgraph around it.',
    loadingSubgraph: 'Loading the subgraph…',
    canvasLabel: 'Subgraph canvas',
    canvasDefaultDescription:
      'The subgraph is drawn on a canvas; the same content is listed.',
    canvasDescription:
      '{nodes} nodes and {edges} relations in the subgraph around the selected root, drawn with a deterministic dagre layout.',
    apiOrigin: 'The graph is read from `{apiBaseUrl}`.',
    listSummary: 'The subgraph as a list',
    listNodesHeading: 'Nodes of the subgraph',
    listNodesCaption:
      'The nodes of the subgraph: title, ontology class and status.',
    listNodesRegion: 'The nodes of the subgraph',
    listRelationsHeading: 'Relations of the subgraph',
    listRelationsCaption:
      'The relations of the subgraph: relation key, endpoints, status and score.',
    listRelationsRegion: 'The relations of the subgraph',
    listNoNodes: 'The subgraph has no node.',
    listNoRelations: 'The subgraph has no relation.',
    unknownNode: 'Unknown node',
    columnTitle: 'Title',
    columnType: 'Type',
    columnStatus: 'Status',
    columnRelation: 'Relation',
    columnFrom: 'From',
    columnTo: 'To',
    columnScore: 'Score',
    columnCorrection: 'Correction',
    columnAttributes: 'Attributes',
    columnWalk: 'Walk',
    walkHere: 'Walk',
    suggestCorrection: 'Suggest a correction',
    suggestCorrectionOfRelation:
      'Suggest a correction of the relation {relationKey}',
    voteRelationLabel: 'the relation {relationKey}',
    viewModeLabel: 'Graph view',
    modeSubgraph: 'Subgraph',
    modeExplore: 'Explore',
    modeHint:
      'Both views read the same workspace: the subgraph around a root, and the exploration window. The view is a choice of the screen, not of the URL.'
  },

  explore: {
    heading: 'Explore',
    listSummary: 'The exploration window as a list',
    controlsLabel: 'The controls of the exploration',
    readoutLabel: 'The state of the picture',
    windowNote:
      'The window is a **closed** graph, it comes in **creation** order and the API bounds it to {max} nodes, with no pagination.',
    hint:
      'Drag the background to pan the canvas, use the wheel to zoom in or out and click a node to walk to it.',
    focusLabel: 'Presented node',
    focusRecent: 'The most recent',
    focusRelated: 'The most related',
    focusManual: 'The one you picked',
    presented: 'It presents “{title}”.',
    focusActive: 'Active criterion: {label}.',
    depthLabel: 'Depth',
    depthHelp:
      'How many hops are recovered around the node you click. It is the same depth the subgraph uses.',
    onlyNeighbourhoodLabel: 'Only the node’s neighbourhood',
    onlyNeighbourhoodHelp:
      'With the switch on, the picture shows only the neighbourhood of the presented node, at the depth that is selected. The rest is hidden.',
    scopeAll: 'The picture holds {shown} nodes: everything that has been seen.',
    scopeFocused:
      'The picture holds {shown} nodes; {hidden} fall outside the neighbourhood of the presented node.',
    walking: 'Recovering the neighbourhood of “{title}”…',
    isolated: '“{title}” has no relations: its neighbourhood is empty.',
    edgeStyleLabel: 'Shape of the arrows',
    edgeStraight: 'A straight line',
    edgeBezier: 'Soft curve',
    edgeUnbundled: 'Open curve',
    edgeArc: 'Arc',
    edgeHaystack: 'Haystack',
    expandBadge: 'Expand “{title}”',
    collapseBadge: 'Collapse “{title}”',
    badgesLabel: 'The nodes of the window',
    expandRelationBadge: 'Expand the relation “{name}”',
    collapseRelationBadge: 'Collapse the relation “{name}”',
    relationBadgesLabel: 'The relations of the window',
    canvasLabel: 'Exploration window canvas',
    canvasDescription:
      '{nodes} nodes and {edges} relations of the exploration window, drawn with a deterministic dagre layout.',
    previewNoDescription: 'No description.',
    previewNoAttributes: 'No attributes.',
    previewEndpoints: 'From “{source}” to “{target}”',
    previewScore: 'Score {score}',
    empty: 'The window is empty: this workspace has no node yet.',
    loading: 'Loading the window…'
  },

  /** The inspector: the column of tabs beside the canvas. */
  inspector: {
    heading: 'Inspector',
    tabsLabel: 'The tabs of the inspector',
    tabContent: 'Content',
    tabAttributes: 'Attributes',
    tabProposals: 'Proposals',
    tabForum: 'Forum',
    expand: 'Show the inspector',
    collapse: 'Hide the inspector',
    emptySelection:
      'Pick a node or a relation in the canvas or in the list to see its content.',
    readingRelation: 'Reading the relation…',
    relationUnreadable: 'The relation could not be read.',
    noAttributes: 'This object carries no attribute.',
    attributesOfNode: 'The attributes of the node',
    attributesOfRelation: 'The attributes of the relation',
    actionsHeading: 'Actions',
    relationKey: 'Relation key',
    source: 'Source',
    target: 'Target',
    nodeType: 'Ontology class',
    status: 'Status',
    score: 'Community score',
    author: 'Authorship',
    created: 'Created',
    relate: 'Relate it to another node',
    suggestCorrection: 'Suggest a correction',
    suggestCorrectionOfNode: 'Suggest a correction of the node {title}',
    suggestCorrectionOfRelation: 'Suggest a correction of the relation {relationKey}',
    editDirectly: 'Edit directly',
    editDirectlyOfRelation: 'Edit the relation {relationKey} directly',
    editDirectlyForbidden:
      'Only the author of the relation may edit it: everybody else proposes a correction.',
    nodeHasNoDirectEdit:
      'A node is never edited directly: a correction is proposed and the author of the node decides.',
    proposalsHeading: 'The proposals of this object',
    loadingProposals: 'Loading the proposals…',
    noProposals: 'No proposal targets this object.',
    proposalsPartial:
      'This history is **partial**: the API returned one bounded page of the proposals of the workspace and there are more beyond it. The API cannot filter by target, so the proposals of this object are filtered out of that page.',
    forumHeading: 'The forum of this object',
    edgeSaved: 'The relation has been updated.',
    edgeSave: 'Save the changes',
    edgeSaving: 'Saving…',
    edgeNothingToSave: 'The form changes nothing yet: change a field before saving it.',
    edgeChanges: 'What this edition changes',
    edgeFormKept: 'The form keeps what you typed: nothing has been saved.'
  },

  node: {
    newNodeTitle: 'New node',
    createIntro:
      'The fields come from the active ontology of this workspace. The node is created **pending**: the community reviews it before it joins the graph.',
    loadingOntology: 'Loading the ontology…',
    noActiveClass:
      'This workspace has no active class: there is nothing to create a node from.',
    ontologyClass: 'Ontology class',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    attributesOf: 'Attributes of {label}',
    noActiveAttributes:
      'This class declares no active attribute: the node is only a title and a description.',
    notShownHeading: 'Not shown in this form',
    skippedExplanation:
      '{label}: the ontology re-declares a field of the node itself, so the value is asked once, in the field above.',
    formProblem: 'The form has {count} problem.',
    formProblems: 'The form has {count} problems.',
    formKept: 'The form kept what you typed: nothing was created.',
    creating: 'Creating…',
    createSubmit: 'Create the node',
    noDescription: 'No description.'
  },

  edge: {
    relateTitle: 'Relate two nodes',
    intro:
      'A relation is created **pending**: the community reviews it before it joins the graph. Only the relations the ontology allows for this node are offered.',
    pickSource:
      'Pick a node in the canvas or in the list before relating it to another one.',
    noRelation:
      'The active ontology declares no relation whose domain is {typeKey}: there is nothing to relate this node with yet.',
    from: 'From',
    fromClass: 'from',
    toClass: 'to',
    relationLabel: 'Relation',
    toLabel: 'To',
    pickTarget: 'Pick the node the relation points at.',
    noTarget:
      'No node of the range class {range} exists in this workspace: create one first.',
    willPointAt: 'The relation will point at {title}.',
    candidates:
      'The candidates are taken from the {count} nodes of the workspace that the list above holds.',
    formKept: 'The form kept what you typed: nothing was created.',
    creating: 'Creating…',
    createSubmit: 'Create the relation'
  },

  correction: {
    title: 'Suggest a correction',
    intro:
      'A proposal is a diff: it changes **nothing** until the author of the target approves it. The proposal is created **pending** — the author of the target is the one who decides.',
    pickTarget:
      'Pick a node or a relation before proposing a correction.',
    readingTarget: 'Reading the target…',
    loadingTarget: 'Loading the target…',
    emptyDescription: 'An empty description clears the text of the node.',
    relationKeyLabel: 'Relation key',
    attributesLegend: 'Attributes',
    attributesNote:
      'The API merges the attributes into the ones of the target: a proposal can change an attribute and add one, but it cannot remove one and it cannot rename one. A row without a value is not sent.',
    noAttributes: 'The target carries no attribute.',
    keyLabel: 'Key of the attribute {index}',
    valueLabel: 'Value of the attribute {index}',
    typeLabel: 'Type of the attribute {index}',
    kept: 'Kept',
    remove: 'Remove',
    removeLabel: 'Remove the attribute {index}',
    notEditable:
      'This value is not a text, a number or a boolean: the form cannot propose a change for it.',
    changesHeading: 'What this proposal changes',
    noChanges:
      'Nothing changes yet: the form sends nothing until a field differs from the target.',
    oneChange: 'One field changes.',
    manyChanges: '{count} fields change.',
    tableCaption:
      'The current value and the proposed value of every field of the target.',
    columnField: 'Field',
    columnCurrent: 'Current',
    columnProposed: 'Proposed',
    columnChange: 'Change',
    changes: 'Changes',
    unchanged: 'Unchanged',
    justificationLabel: 'Justification',
    justificationHelp:
      'Why the correction is proposed — the maintainer of the target reads it.',
    formProblem: 'The form has {count} problem.',
    formProblems: 'The form has {count} problems.',
    nothingToPropose:
      'This proposal changes nothing: change a field before sending it.',
    formKept: 'The form kept what you typed: nothing was proposed.',
    proposing: 'Proposing…',
    proposeSubmit: 'Propose the correction',
    fieldTitle: 'Title',
    fieldDescription: 'Description',
    fieldRelationKey: 'Relation key',
    attributeField: 'Attribute “{key}”',
    addAttribute: 'Add an attribute',
    typeText: 'Text',
    typeNumber: 'Number',
    typeCheckbox: 'Checkbox'
  },

  proposals: {
    pageTitle: 'Proposals — VozLab',
    heading: 'Proposals',
    intro:
      'The knowledge pull requests of the workspace: open one to see the proposed change, to discuss it and to vote on it. The active workspace is carried by a request header, not by the URL: the path stays `/proposals`.',
    filtersHeading: 'Filters',
    filterStatus: 'Status',
    filterTarget: 'Target',
    filterKind: 'Kind',
    targetNode: 'Node',
    targetRelation: 'Relation',
    targetOntology: 'Ontology class',
    kindEdit: 'Edit',
    kindMerge: 'Merge',
    nounNode: 'node',
    nounRelation: 'relation',
    nounOntology: 'ontology class',
    listHeading: 'The proposals of the workspace',
    listRegion: 'The proposals of the workspace',
    listCaption:
      'The proposals of the workspace: kind and target, status, community score and creation date.',
    columnProposal: 'Proposal',
    columnStatus: 'Status',
    columnScore: 'Score',
    columnCreated: 'Created',
    editProposalOf: 'Edit proposal {target}',
    mergeProposalOf: 'Merge proposal {target}',
    loading: 'Loading the proposals…',
    none: 'No proposal matches these filters in this workspace.',
    showOlder: 'Show older proposals',
    detailHeading: 'The proposal under review',
    pickProposal:
      'Pick a proposal in the list to see its proposed change, its discussion and the controls of its resolution.',
    mergeProposal: 'Merge proposal',
    editProposal: 'Edit proposal',
    target: 'Target',
    author: 'Author',
    created: 'Created',
    resolved: 'Resolved',
    daysAgo: '{count} days ago',
    proposedChange: 'Proposed change',
    voteHeading: 'Vote',
    resolutionHeading: 'Resolution',
    nowStatus: 'The proposal is now {status}.',
    readingTarget: 'Reading the target of the proposal…',
    notOpen: 'This proposal is {status}: it is not open for a resolution.',
    approve: 'Approve',
    reject: 'Reject',
    autoApply: 'Auto-apply',
    belongsToMaintainer:
      'Resolving a proposal belongs to the maintainer of its target.',
    autoApplyBlocked:
      'The auto-apply is not available: {reason}',
    autoApplyBlockedScore:
      'the community score is below {score}.',
    autoApplyBlockedAge: 'the proposal is younger than {days} days.',
    autoApplyBlockedRole:
      'the role in this workspace is not a moderator or an administrator.',
    autoApplyBlockedClosed: 'the proposal is not open.',
    discussionHeading: 'Discussion of this proposal'
  },

  delta: {
    mergeInto:
      'This proposal merges the target into the surviving node',
    nodeBelow: 'the node below',
    noSurvivor:
      'The payload of this merge proposal does not name a surviving node ({reason}).',
    noChange: 'This proposal carries no change.'
  },

  discussions: {
    pageTitle: 'Discussions — VozLab',
    heading: 'Discussions',
    intro:
      'A discussion is always about something: a node, a relation, a proposal or an ontology class. The target is named in the query string; the active workspace is carried by a request header, not by the URL.',
    targetHeading: 'Target',
    kindLabel: 'Kind of object',
    targetNode: 'Node',
    targetRelation: 'Relation',
    targetProposal: 'Proposal',
    targetOntology: 'Ontology class',
    identifierLabel: 'Identifier',
    identifierPlaceholder: 'The uuid of the object',
    show: 'Show the discussion',
    pickNode: 'Or pick a node of the workspace',
    noNodePicked: 'No node picked',
    pickTarget:
      'Pick a target above to read its threads. The node details panel links here with the node preselected.',
    threadsHeading: 'Threads of the target'
  },

  discussion: {
    heading: 'Discussion',
    titleTooShort: 'The title must be at least 3 characters long.',
    emptyReply: 'A reply cannot be empty.',
    threadOpened: 'The thread “{title}” was opened.',
    commentPosted: 'Your comment was posted.',
    replyPosted: 'Your reply was posted.',
    threadClosed: 'The thread “{title}” was closed.',
    commentDeleted: 'The comment was deleted.',
    newThread: 'New thread',
    newThreadPlaceholder: 'What should the community discuss?',
    opening: 'Opening…',
    startThread: 'Start the thread',
    loadingThreads: 'Loading the threads…',
    noThreads: 'No thread discusses this object yet.',
    closedSuffix: '· closed',
    threadClosedLabel: 'Thread closed',
    closeThread: 'Close the thread',
    showOlderThreads: 'Show older threads',
    commentsOf: 'Comments of “{title}”',
    loadingComments: 'Loading the comments…',
    noComments: 'This thread holds no comment yet.',
    showOlderComments: 'Show older comments',
    writeComment: 'Write a comment',
    writeReply: 'Write a reply',
    replyingTo: 'Replying to “{body}”',
    cancelReply: 'Cancel the reply',
    commentPlaceholder: 'Your comment…',
    posting: 'Posting…',
    postComment: 'Post the comment',
    postReply: 'Post the reply',
    reply: 'Reply',
    delete: 'Delete'
  },

  vote: {
    thisItem: 'this item',
    thisProposal: 'this proposal',
    thisComment: 'this comment',
    onLabel: 'Vote on {label}',
    upvote: 'Upvote {label}',
    downvote: 'Downvote {label}',
    score: 'Score',
    alreadyCounted: 'Your vote was already counted: the score is unchanged.',
    recorded: 'Your vote was recorded. The score is now {score}.',
    rejectedTitle: 'The vote was rejected'
  },

  offline: {
    heading: 'You are offline.',
    text:
      'You can keep reading what is already loaded, but creating, editing, voting and resolving are blocked until the connection is back. Nothing is queued in the meantime.'
  },

  install: {
    message:
      'VozLab can be installed on this device and open in its own window.',
    action: 'Install VozLab'
  },

  pwa: {
    errorTitle: 'The offline support could not be enabled',
    errorHint:
      'The app keeps working, but it will not be available offline.',
    offlineReady:
      'VozLab is ready to work offline: the app is cached on this device.',
    dismiss: 'Got it'
  },

  update: {
    available: 'A new version of VozLab is available.',
    reload: 'Reload now'
  },

  errors: {
    offline:
      'The browser is offline: the request was not sent. This action needs the network.',
    unexpected: 'The request failed.'
  },

  validation: {
    titleTooShort: 'The title must be at least {min} characters.',
    titleTooLong: 'The title must be at most {max} characters.',
    titleLength: 'The title must be between {min} and {max} characters.',
    relationKeyLength:
      'The relation key must be between {min} and {max} characters.',
    justificationTooLong:
      'The justification must be at most {max} characters.',
    attributeRequired: 'This attribute is required.',
    attributeMustBeText: 'This attribute must be a text.',
    attributeMustBeNumber: 'This attribute must be a number.',
    attributeMustBeBoolean: 'This attribute must be true or false.',
    attributeMustBeDate: 'This attribute must be a date (YYYY-MM-DD).',
    attributeHasNoAllowedValue: 'This attribute has no allowed value.',
    attributeMustBeOneOf: 'This attribute must be one of: {allowed}.',
    attributeUnknownKind: 'This attribute has an unknown kind.',
    duplicateAttributeKey: 'Two rows carry the same key.',
    attributeCannotBeEmptied:
      'An existing attribute cannot be emptied: the API merges the attributes, it cannot remove one.'
  },

  /**
   * The labels of the **statuses**.
   *
   * A status is a value of the domain, not a sentence: the labels live in a
   * map per scope, and each map is typed against the vocabulary of the shared
   * contract. A status that is missing is a **compile error**, here and in
   * the Spanish dictionary alike.
   */
  statuses: {
    node: {
      DRAFT: 'Draft',
      PENDING: 'Pending',
      ACTIVE: 'Active',
      MERGED: 'Merged',
      DEPRECATED: 'Deprecated',
      REJECTED: 'Rejected'
    },
    edge: {
      DRAFT: 'Draft',
      PENDING: 'Pending',
      ACTIVE: 'Active',
      REJECTED: 'Rejected'
    },
    proposal: {
      PENDING: 'Pending',
      APPROVED_BY_AUTHOR: 'Approved by the author',
      REJECTED_BY_AUTHOR: 'Rejected by the author',
      AUTO_APPLIED: 'Applied automatically'
    },
    thread: {
      OPEN: 'Open',
      CLOSED: 'Closed'
    }
  }
};
