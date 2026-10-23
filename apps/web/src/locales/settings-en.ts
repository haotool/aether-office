export const settingsEn = {
  sectGeneral: 'General',
  sectGeneralHint: 'Language, appearance, motion and quality',
  sectNotify: 'Notifications & approvals',
  sectNotifyHint: 'Be called back, and answer permission prompts here',
  sectConnect: 'Connections',
  sectConnectHint: 'Phone pairing, installing as an app, HTTPS',
  sectModels: 'Models & execution',
  sectModelsHint: 'Detected models, local sessions, execution policy and hook commands',
  sectOffice: 'Office',
  sectOfficeHint: 'Default view, auto camera and decoration',
  sectAdvanced: 'Advanced',
  sectAdvancedHint: 'The Advanced switch, schedules, A2A, integrations and execution hosts',
  sectData: 'Data & privacy',
  sectDataHint: 'What is stored where, export, reset and sign out',
  sectAbout: 'About',
  sectAboutHint: 'Version, links, licenses and keyboard shortcuts',

  stNavLabel: 'Settings groups',
  stSearch: 'Search settings',
  stSearchPlaceholder: 'Search settings (press /)',
  stSearchClear: 'Clear search',
  stNoResults: 'No settings match',
  stMatches: 'matching settings',

  stOn: 'On',
  stOff: 'Off',
  stOwnerOnly: 'Owner only',
  stOperatorOnly: 'Operators only',
  stLiveOnly: 'Not available in demo mode',
  stNeedsHttps: 'Needs HTTPS or localhost',
  stDanger: 'Danger zone',
  stCopy: 'Copy',
  stCopied: 'Copied',
  stCopyFailed: 'Could not copy; select it by hand',

  stLanguageDesc: 'Interface language. Applies at once and is remembered in this browser.',
  stSystem: 'System',
  stSystemNow: 'System is now',
  stThemeDesc: 'Follow the system, or stay dark or light.',
  stMotionDesc:
    'Calms the scene and the interface; while it is on the automatic camera is off too. It takes your operating system’s setting the first time and is yours after that, it does not follow later system changes. Decorative office moments are controlled separately by Calm mode.',
  stOsReduced: 'Your system asks for reduced motion',
  stQualityDesc:
    '3D scene quality: Low saves power and draws no shadows; High is the sharpest and costs the most.',
  stFpsLabel: 'Frame rate limit',
  stFpsAuto: 'Auto',
  stFpsDesc:
    'The most frames a second the 3D scene draws. 30 saves the most battery and heat; Auto draws as often as the screen asks, up to 120 on a fast display.',

  stPermGranted: 'Browser allows it',
  stPermDenied: 'Blocked in the browser',
  stPermAsk: 'Will ask on your first click',
  stPermReenable: 'How to allow it again',
  stPermReenableSteps:
    'Click the lock or site-info icon beside the address, set Notifications to Allow, then reload the page.',
  stNotifyNeedsHttps:
    'System notifications need a secure connection (HTTPS or localhost). For now alerts appear inside the page.',
  stRemoteDesc:
    'Off by default. When on, permission prompts from Claude Code sessions that have the hook appear here for you to allow or deny; AETHER never allows anything by itself.',
  stRemoteHow: 'How it works and installing the hook',
  stHookStatusNote:
    'Whether the hook is installed is checked in a terminal; this page cannot see your ~/.claude.',
  stChannelOk: 'Answering allowed on this connection',
  stChannelBlocked: 'Plain HTTP: answering refused here',
  stChannelLan: 'Plain HTTP on the network allowed',

  stInstallLabel: 'Install as an app',
  stInstallDesc:
    'Opens full screen from the home screen; a new version asks before it replaces the old one.',
  stInstalled: 'Installed (running as an app)',
  stInstallable: 'This browser can install it',
  stInstallNone: 'No install offer now (already installed, dismissed or not supported)',
  stAddressLabel: 'Address and security of this page',
  stAddressDesc:
    'Notifications, installing as an app and answering permission prompts need HTTPS or localhost.',
  stSecure: 'Secure connection',
  stInsecure: 'Plain HTTP (not secure)',
  stHttpsHelp: 'Getting HTTPS',
  stHttpsHelpBody:
    'localhost counts as secure: open AETHER on this computer. A phone on the local network gets plain HTTP; to use notifications, installing and remote approvals there, put HTTPS in front, for example a Tailscale tunnel or a reverse proxy (see the docs).',

  stLocalLabel: 'Local sessions',
  stLocalDesc:
    'Finds your Claude Code and Codex sessions from their records on this computer. The environment variable AETHER_LOCAL_SESSIONS=off turns it off.',
  stLocalOff: 'Off',
  stLocalOffHow:
    'The control plane was started with AETHER_LOCAL_SESSIONS=off. Remove the variable and restart it to turn discovery on.',
  stLocalUnknown: 'Not loaded',
  stSessionsFound: 'sessions found',
  stCliLabel: 'Terminal commands',
  stCliDesc:
    'Check your setup, and see or install the hooks that tell AETHER what a session is doing.',
  stCliDoctor: 'Report OS, Node, Git and Claude / Codex CLI versions',
  stCliStatus: 'See whether the hook is installed',
  stCliInstall: 'Install the hook',

  stViewLabel: 'Default view',
  stViewDesc:
    'The office opens as the 3D space or the 2D list. If 3D is not available it falls back to 2D.',
  stCameraLabel: 'Auto camera',
  stCameraDesc:
    'The camera cuts to who is talking, waiting for you or working; a touch hands it back to you.',
  stCameraAutomation: 'Off by default under browser automation',
  stBeanstalkDesc:
    'Shows the beanstalk that rises with Git history beside the 3D building. Off by default on a phone.',
  stLifeCalmLabel: 'Calm mode',
  stLifeCalmDesc:
    'Turns off every little decorative moment in the 3D office. Squad effects stay, without motion. On by default when your system asks for reduced motion.',
  lifeCalmOn: 'Calm mode is on: the kinds below show nothing',
  stLifeRelationLabel: 'Relation effects',
  stLifeRelationDesc:
    'Squads and their subagents: the zone, the team workstations, the beam and the hand-over.',
  stStringsLabel: 'Puppet strings',
  stStringsDesc:
    'Thin strings of light from a control bar to each working subagent. They tighten on every tool call and go slack when it rests. Off on the low quality tier, still in Calm mode.',
  stLifeKindsLabel: 'Kinds of moments',
  stLifeKindsDesc:
    'Small decorative animations that follow what a session does. They never say whether anything worked.',
  lifeKindWork: 'Work',
  lifeKindGit: 'Git',
  lifeKindTest: 'Tests and builds',
  lifeKindOps: 'Ops',
  lifeKindWellbeing: 'Wellbeing',
  lifeKindSocial: 'Social',
  lifeKindMeme: 'Memes',
  lifeKindEaster: 'Easter eggs',
  stLifeFrequencyLabel: 'Meme frequency',
  stLifeFrequencyDesc: 'Rare halves how often memes and social moments appear.',
  lifeRare: 'Rare',
  lifeNormal: 'Normal',
  stIntroLabel: 'Intro tour',
  stIntroDesc:
    'The camera tour of the building, played once per visit. Replay it below or from the building panel.',
  introAuto: 'Once per visit',
  introNever: 'Never',
  stIntroReplayLabel: 'Replay the intro',
  stIntroReplayDesc: 'Plays the camera tour of the building again, now, on the office page.',
  introReplayButton: 'Replay intro',

  stSchedulesDesc: 'Create tasks on a timer: once, daily or weekly.',
  stA2aLabel: 'A2A',
  stA2aDesc:
    'Lets other agents call this office over the A2A protocol. Off by default; turned on in the control plane’s environment.',
  stIntegrationsDesc: 'Connect a GitHub repository and sync it.',
  stHostsLabel: 'Execution hosts and workspaces',
  stHostsDesc: 'Open the pages for execution hosts (runners) and workspaces.',

  stStorageLabel: 'What is stored where',
  stStorageDesc: 'Where your preferences, your sign-in and your project data live.',
  stStorageShow: 'Show details',
  stStoreBrowser: 'This browser',
  stStoreBrowserBody:
    'Preferences (language, theme, switches; key aether-ui-preferences) and a dismissed install offer. Only in this browser; never uploaded.',
  stStoreCookie: 'Sign-in',
  stStoreCookieBody:
    'One HttpOnly session cookie, removed when you sign out. The token is never put in a URL or in the web code.',
  stStoreServer: 'Control plane data folder',
  stStoreServerBody:
    'Projects, tasks, approvals and history live in SQLite in the control plane’s data folder; the owner token is a file in it.',
  stStoreSessions: 'Claude Code and Codex records',
  stStoreSessionsBody:
    'Read from their own folders, never written or stored; transcript text is read only when you open that session.',
  stPrefsLabel: 'Local interface preferences',
  stPrefsDesc:
    'Export or reset the preferences kept in this browser. Project data stays and you stay signed in.',
  stExport: 'Export JSON',
  stReset: 'Reset preferences',
  stResetConfirm: 'Reset? This clears this browser’s preferences and reloads the page.',
  stSignOutDesc: 'Sign out of this browser; other devices are not affected.',

  stVersionLabel: 'Version and mode',
  stVersionDesc:
    'The control plane’s version and the data mode (DEMO is demonstration data, LIVE is real).',
  stShortcutsLabel: 'Keyboard shortcuts',
  stShortcutsDesc: 'The keys the app really binds.',
  stKeyQuick: 'Quick open for pages and sessions',
  stKeySearch: 'Search settings (on this page)',
  stKeyClose: 'Close a dialog or sheet',
  stKeySend: 'Send · new line (desktop composer)',
  stLinksLabel: 'Links and licenses',
  stLinksDesc:
    'Open source under the MIT License. The notices list the third-party software in this build and its licenses. Not affiliated with Anthropic or OpenAI.',
  stLinkRepo: 'Source code (GitHub)',
  stLinkDocs: 'Getting started',
  stLinkSecurity: 'Security',
  stLinkNotices: 'Third-party notices',
  stLinkLicense: 'License (MIT)',
} as const;
