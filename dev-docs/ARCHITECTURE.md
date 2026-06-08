# AudioBash System Architecture

> **Complete Visual Map of All Processes, Components, and Data Flows**

---

## Master Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AUDIOBASH ARCHITECTURE                                      │
│                         Voice-Controlled Terminal for Claude Code                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                           ELECTRON MAIN PROCESS                                  │   │
│  │                            (electron/main.cjs)                                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │   │
│  │  │   Window    │ │    PTY      │ │   Global    │ │   System    │               │   │
│  │  │  Manager    │ │  Manager    │ │  Shortcuts  │ │    Tray     │               │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘               │   │
│  │  ┌─────────────┐ ┌─────────────┐                                               │   │
│  │  │   Whisper   │ │     AI      │                                               │   │
│  │  │   Service   │ │   Clients   │                                               │   │
│  │  │  (Local)    │ │(Gemini/OAI) │                                               │   │
│  │  └─────────────┘ └─────────────┘                                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                               │   │
│  │  │    File     │ │  Persistent │ │   Logger    │                               │   │
│  │  │   Watcher   │ │   Storage   │ │   Service   │                               │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                               │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         │ IPC Bridge                                    │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          PRELOAD SCRIPT (Context Bridge)                         │   │
│  │                            (electron/preload.cjs)                                │   │
│  │                                                                                  │   │
│  │   53 APIs exposed via window.electron:                                          │   │
│  │   • Window Control (3)    • Terminal I/O (10)     • Voice Events (2)            │   │
│  │   • Mode/Navigation (8)   • Shortcuts (3)         • API Keys (2)               │   │
│  │   • Transcription (4)     • Directories (5)       • Preview (7)                │   │
│  │   • Whisper Local (10)                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                               │
│                                         │ contextBridge.exposeInMainWorld              │
│                                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │                            REACT RENDERER PROCESS                                │   │
│  │                               (src/index.tsx)                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │   │
│  │  │                         CONTEXT PROVIDERS                                │    │   │
│  │  │   ┌─────────────┐   ┌──────────────────┐   ┌────────────────┐           │    │   │
│  │  │   │ErrorBoundary│ → │ConsoleErrorProvider│ → │ ThemeProvider │           │    │   │
│  │  │   └─────────────┘   └──────────────────┘   └────────────────┘           │    │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                    │                                             │   │
│  │  ┌─────────────────────────────────▼───────────────────────────────────────┐    │   │
│  │  │                              App.tsx                                     │    │   │
│  │  │                     (State Orchestrator)                                 │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │    │   │
│  │  │  │  Tabs    │ │  Voice   │ │ Settings │ │  Layout  │ │ Preview  │      │    │   │
│  │  │  │  State   │ │  State   │ │  State   │ │  State   │ │  State   │      │    │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │    │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                    │                                             │   │
│  │  ┌─────────────────────────────────▼───────────────────────────────────────┐    │   │
│  │  │                           UI COMPONENTS                                  │    │   │
│  │  │  ┌──────────────────────────────────────────────────────────────────┐   │    │   │
│  │  │  │ TitleBar │ TabBar │ LayoutSelector │ StatusIndicator             │   │    │   │
│  │  │  └──────────────────────────────────────────────────────────────────┘   │    │   │
│  │  │  ┌──────────────────────────────────────────────────────────────────┐   │    │   │
│  │  │  │                    TERMINAL LAYER                                 │   │    │   │
│  │  │  │  ┌────────────┐  ┌────────────┐  ┌─────────────┐                 │   │    │   │
│  │  │  │  │  Terminal  │  │   Split    │  │   Resize    │                 │   │    │   │
│  │  │  │  │ (xterm.js) │  │ Container  │  │   Divider   │                 │   │    │   │
│  │  │  │  └────────────┘  └────────────┘  └─────────────┘                 │   │    │   │
│  │  │  └──────────────────────────────────────────────────────────────────┘   │    │   │
│  │  │  ┌──────────────────────────────────────────────────────────────────┐   │    │   │
│  │  │  │                    OVERLAY COMPONENTS                             │   │    │   │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────────┐    │   │    │   │
│  │  │  │  │  Voice   │ │ Settings │ │ Directory │ │ ConsoleError    │    │   │    │   │
│  │  │  │  │ Overlay  │ │  Modal   │ │  Picker   │ │    Viewer       │    │   │    │   │
│  │  │  │  └──────────┘ └──────────┘ └───────────┘ └─────────────────┘    │   │    │   │
│  │  │  └──────────────────────────────────────────────────────────────────┘   │    │   │
│  │  │  ┌──────────────────────────────────────────────────────────────────┐   │    │   │
│  │  │  │                    PREVIEW PANE                                   │   │    │   │
│  │  │  │  ┌────────────────┐  ┌────────────────┐                         │   │    │   │
│  │  │  │  │ PreviewControls│  │PreviewRenderer │                         │   │    │   │
│  │  │  │  └────────────────┘  └────────────────┘                         │   │    │   │
│  │  │  └──────────────────────────────────────────────────────────────────┘   │    │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                    │                                             │   │
│  │  ┌─────────────────────────────────▼───────────────────────────────────────┐    │   │
│  │  │                            SERVICES                                      │    │   │
│  │  │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐   │    │   │
│  │  │  │  TranscriptionService   │  │  ElevenLabsRealtimeService          │   │    │   │
│  │  │  │  (Multi-Provider Batch) │  │  (WebSocket Streaming)              │   │    │   │
│  │  │  └─────────────────────────┘  └─────────────────────────────────────┘   │    │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                    │                                             │   │
│  │  ┌─────────────────────────────────▼───────────────────────────────────────┐    │   │
│  │  │                           UTILITIES                                      │    │   │
│  │  │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────────┐ ┌─────────┐  │    │   │
│  │  │  │  Logger  │ │ Audio     │ │   Audio    │ │   Audio    │ │Notif.   │  │    │   │
│  │  │  │          │ │ Feedback  │ │   Utils    │ │ Conversion │ │Sound    │  │    │   │
│  │  │  └──────────┘ └───────────┘ └────────────┘ └────────────┘ └─────────┘  │    │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Component Relationships

```mermaid
flowchart TB
    subgraph MAIN["⚡ ELECTRON MAIN PROCESS"]
        direction TB

        subgraph WindowMgmt["Window Management"]
            BW[BrowserWindow]
            Tray[System Tray]
            Menu[Context Menu]
        end

        subgraph PTY["Terminal PTY Management"]
            NodePTY[node-pty]
            PTYPool["PTY Pool (max 4)"]
            OutputBuffer["Output Buffer<br/>(2000 chars)"]
            CWDTracker["CWD Tracker"]
        end

        subgraph Shortcuts["Global Shortcuts"]
            GS[globalShortcut API]
            ShortcutConfig["shortcuts.json"]
        end

        subgraph AI["AI Integration"]
            GeminiClient["Gemini Client<br/>(GoogleGenerativeAI)"]
            WhisperSvc["Whisper Service<br/>(Local)"]
        end

        subgraph Storage["Persistent Storage"]
            AppStore["app-store.json"]
            DirStore["directories.json"]
            APIKeys["API Keys<br/>(encrypted)"]
        end

        Logger["Logger Service"]
        FileWatcher["File Watcher<br/>(300ms debounce)"]
    end

    subgraph PRELOAD["🔌 IPC BRIDGE (preload.cjs)"]
        direction LR
        CB["contextBridge<br/>exposeInMainWorld"]

        subgraph IPCChannels["IPC Channels"]
            TermIPC["terminal-*<br/>(10 channels)"]
            VoiceIPC["*-recording<br/>(2 channels)"]
            ShortcutIPC["*-shortcuts<br/>(3 channels)"]
            WhisperIPC["whisper-*<br/>(10 channels)"]
            WinIPC["minimize/maximize/close"]
        end
    end

    subgraph RENDERER["⚛️ REACT RENDERER PROCESS"]
        direction TB

        subgraph Contexts["Context Providers"]
            EB[ErrorBoundary]
            CEP[ConsoleErrorProvider]
            TP[ThemeProvider]
        end

        subgraph AppState["App.tsx - State Manager"]
            TabState["Tab State<br/>(tabs[], activeTabId)"]
            VoiceState["Voice State<br/>(isRecording, mode)"]
            LayoutState["Layout State<br/>(mode, panes)"]
            SettingsState["Settings State<br/>(autoSend, etc)"]
            PreviewState["Preview State<br/>(visible, position)"]
        end

        subgraph Components["UI Components"]
            TitleBar["TitleBar"]
            TabBar["TabBar + LayoutSelector"]
            Terminal["Terminal (xterm.js)"]
            SplitContainer["SplitContainer"]
            VoiceOverlay["VoiceOverlay"]
            Settings["Settings Modal"]
            DirPicker["DirectoryPicker"]
            Preview["PreviewPane"]
            StatusBar["StatusIndicator"]
            ConsoleViewer["ConsoleErrorViewer"]
            Onboarding["Onboarding"]
        end

        subgraph Services["Services"]
            TranscriptionSvc["TranscriptionService<br/>(12 models, 5 providers)"]
            ElevenLabsSvc["ElevenLabsRealtimeService<br/>(WebSocket streaming)"]
        end

        subgraph Utils["Utilities"]
            LoggerUtil["logger.ts"]
            AudioFeedback["audioFeedback.ts"]
            AudioUtils["audioUtils.ts"]
            AudioConvert["audioConversion.ts"]
            NotifSound["notificationSound.ts"]
        end

        subgraph Hooks["Custom Hooks"]
            UseVAD["useVAD"]
            UseElevenLabs["useElevenLabsRealtime"]
            UsePCM["usePCMCapture"]
            UseFileWatch["useFileWatcher"]
            UseTheme["useTheme"]
            UseConsoleErrors["useConsoleErrors"]
        end
    end

    subgraph EXTERNAL["🌐 EXTERNAL SERVICES"]
        GeminiAPI["Google Gemini API"]
        ElevenLabsAPI["ElevenLabs API<br/>(Scribe + Realtime)"]
    end

    %% Main process connections
    BW --> CB
    NodePTY --> PTYPool
    PTYPool --> OutputBuffer
    OutputBuffer --> CWDTracker
    GS --> ShortcutConfig

    %% IPC connections
    MAIN <--> PRELOAD
    PRELOAD <--> RENDERER

    %% Renderer internal connections
    EB --> CEP --> TP --> AppState
    AppState --> Components
    Components --> Services
    Components --> Utils
    Components --> Hooks

    %% External API connections
    TranscriptionSvc --> GeminiAPI
    TranscriptionSvc --> ElevenLabsAPI
    ElevenLabsSvc --> ElevenLabsAPI
```

---

## Voice-to-Command Data Flow

```mermaid
sequenceDiagram
    participant User
    participant VoiceOverlay
    participant MediaRecorder
    participant TranscriptionService
    participant AIProvider
    participant App
    participant IPC
    participant MainProcess
    participant PTY
    participant Shell
    participant Terminal

    Note over User,Terminal: VOICE RECORDING FLOW

    User->>VoiceOverlay: Click mic / Alt+S
    VoiceOverlay->>VoiceOverlay: Set status='recording'
    VoiceOverlay->>MediaRecorder: Start capture
    MediaRecorder->>MediaRecorder: Collect WebM chunks

    User->>VoiceOverlay: Stop / Alt+S
    MediaRecorder->>VoiceOverlay: Return Blob
    VoiceOverlay->>VoiceOverlay: Set status='processing'

    Note over VoiceOverlay,AIProvider: TRANSCRIPTION FLOW

    VoiceOverlay->>TranscriptionService: transcribeAudio(blob, mode, model)

    alt Gemini Model
        TranscriptionService->>TranscriptionService: Blob → Base64
        TranscriptionService->>AIProvider: Gemini API (audio + prompt)
    else Local Whisper
        TranscriptionService->>IPC: saveTempAudio(base64)
        IPC->>MainProcess: Save to temp file
        TranscriptionService->>IPC: whisperTranscribe(path)
        IPC->>MainProcess: whisper.cpp transcription
    end

    AIProvider-->>TranscriptionService: Transcribed/converted text
    TranscriptionService-->>VoiceOverlay: {text, cost}

    Note over VoiceOverlay,Terminal: COMMAND EXECUTION FLOW

    VoiceOverlay->>App: onTranscript(text, mode)
    App->>App: Save lastTranscript

    alt previewBeforeExecute
        App->>IPC: insertToTerminal(tabId, text)
        Note right of App: User reviews before Enter
    else autoSend enabled
        App->>IPC: sendToTerminal(tabId, text)
    end

    IPC->>MainProcess: terminal-write / send-to-terminal
    MainProcess->>PTY: ptyProcess.write(text + '\r')
    PTY->>Shell: Execute command
    Shell-->>PTY: Output stream
    PTY-->>MainProcess: onData(output)
    MainProcess->>MainProcess: Buffer last 2000 chars
    MainProcess->>MainProcess: Parse CWD from prompt
    MainProcess->>IPC: terminal-data event
    IPC->>Terminal: onTerminalData callback
    Terminal->>Terminal: xterm.write(data)

    Note over User,Terminal: USER SEES RESULT
```

---

## IPC Channel Map

```mermaid
flowchart LR
    subgraph RENDERER["Renderer Process"]
        direction TB
        R_Win["Window Controls"]
        R_Term["Terminal Ops"]
        R_Voice["Voice Events"]
        R_ModeNav["Mode/Navigation"]
        R_Short["Shortcuts"]
        R_API["API Keys"]
        R_Trans["Transcription"]
        R_Dir["Directories"]
        R_Prev["Preview"]
        R_Whisper["Local Whisper"]
    end

    subgraph IPC["IPC Channels"]
        direction TB

        subgraph Window["Window (3)"]
            minimize
            maximize
            close
        end

        subgraph Terminal["Terminal (10)"]
            create-terminal
            close-terminal
            get-terminal-count
            terminal-write
            terminal-resize
            send-to-terminal
            insert-to-terminal
            terminal-data
            terminal-closed
            get-terminal-context
        end

        subgraph Voice["Voice (2)"]
            toggle-recording
            cancel-recording
        end

        subgraph ModeNav["Mode/Navigation (8)"]
            toggle-mode
            clear-terminal
            cycle-layout
            focus-next-terminal
            focus-prev-terminal
            bookmark-directory
            resend-last
            switch-tab
        end

        subgraph Shortcuts["Shortcuts (3)"]
            get-shortcuts
            set-shortcuts
            validate-shortcut
        end

        subgraph API["API Keys (2)"]
            get-api-key
            set-api-key
        end

        subgraph Trans["Transcription (2)"]
            transcribe-with-gemini
            transcribe-with-elevenlabs
        end

        subgraph Dir["Directories (5)"]
            get-directories
            add-favorite-directory
            remove-favorite-directory
            cd-to-directory
            browse-directory
        end

        subgraph Prev["Preview (7)"]
            capture-preview
            watch-file
            unwatch-file
            validate-file-path
            file-changed
            toggle-preview
            capture-screenshot
        end

        subgraph Whisper["Whisper (10)"]
            whisper-transcribe
            whisper-set-model
            whisper-get-models
            whisper-download-model
            whisper-is-model-downloaded
            whisper-delete-model
            whisper-install
            whisper-get-status
            whisper-full-setup
            save-temp-audio
        end

    end

    subgraph MAIN["Main Process"]
        direction TB
        M_BW["BrowserWindow"]
        M_PTY["PTY Manager"]
        M_GS["Global Shortcuts"]
        M_Store["Storage"]
        M_AI["AI Clients"]
        M_Whisper["Whisper Service"]
        M_FS["File System"]
    end

    R_Win --> Window --> M_BW
    R_Term --> Terminal --> M_PTY
    R_Voice --> Voice --> M_GS
    R_ModeNav --> ModeNav --> M_GS
    R_Short --> Shortcuts --> M_Store
    R_API --> API --> M_Store
    R_Trans --> Trans --> M_AI
    R_Dir --> Dir --> M_FS
    R_Prev --> Prev --> M_FS
    R_Whisper --> Whisper --> M_Whisper
```

---

## React Component Hierarchy

```mermaid
flowchart TB
    subgraph Root["Entry Point"]
        Index["index.tsx"]
    end

    subgraph Providers["Context Providers"]
        EB["ErrorBoundary"]
        CEP["ConsoleErrorProvider"]
        TP["ThemeProvider"]
    end

    subgraph App["App.tsx (State Orchestrator)"]
        direction TB

        subgraph TopBar["Top Bar"]
            TitleBar["TitleBar<br/>• minimize()<br/>• maximize()<br/>• close()"]
            TabBar["TabBar<br/>• tabs[]<br/>• activeTabId<br/>• onSelectTab()"]
            LayoutSelector["LayoutSelector<br/>• currentMode<br/>• onSelectLayout()"]
        end

        subgraph MainContent["Main Content Area"]
            direction TB

            subgraph TerminalArea["Terminal Layer"]
                Terminal["Terminal<br/>• tabId<br/>• xterm.js instance<br/>• writeToTerminal()<br/>• onTerminalData()"]
                SplitContainer["SplitContainer<br/>• layoutState<br/>• panes[]"]
                ResizeDivider["ResizeDivider<br/>• orientation<br/>• onResize()"]
                FocusIndicator["FocusIndicator<br/>• isRecording"]
            end

            subgraph PreviewArea["Preview Pane"]
                PreviewPane["PreviewPane<br/>• url<br/>• position<br/>• autoRefresh"]
                PreviewControls["PreviewControls<br/>• onRefresh()<br/>• onScreenshot()"]
                PreviewRenderer["PreviewRenderer<br/>• html/image/markdown"]
            end
        end

        subgraph StatusArea["Status Bar"]
            StatusIndicator["StatusIndicator<br/>• isRecording<br/>• model<br/>• status"]
        end

        subgraph Overlays["Overlay Components"]
            VoiceOverlay["VoiceOverlay<br/>• isRecording<br/>• mode<br/>• transcript<br/>• startRecording()<br/>• stopRecording()"]
            Settings["Settings<br/>• API keys<br/>• model selection<br/>• shortcuts<br/>• vocabulary"]
            DirectoryPicker["DirectoryPicker<br/>• recentDirs[]<br/>• favoriteDirs[]<br/>• cdToDirectory()"]
            ConsoleErrorViewer["ConsoleErrorViewer<br/>• errors[]<br/>• copyError()<br/>• clearErrors()"]
            Onboarding["Onboarding<br/>• currentStep<br/>• handleNext()"]
        end
    end

    Index --> EB --> CEP --> TP --> App
    App --> TopBar
    App --> MainContent
    App --> StatusArea
    App --> Overlays

    TopBar --> TitleBar
    TopBar --> TabBar
    TabBar --> LayoutSelector

    TerminalArea --> Terminal
    TerminalArea --> SplitContainer
    SplitContainer --> ResizeDivider
    Terminal --> FocusIndicator

    PreviewArea --> PreviewPane
    PreviewPane --> PreviewControls
    PreviewPane --> PreviewRenderer
```

---

## Transcription Service Architecture

```mermaid
flowchart TB
    subgraph Input["Audio Input Sources"]
        Manual["Manual Recording<br/>(MediaRecorder)"]
        VAD["VAD Recording<br/>(useVAD hook)"]
        Realtime["Realtime Streaming<br/>(useElevenLabsRealtime)"]
    end

    subgraph TranscriptionService["TranscriptionService (Singleton)"]
        direction TB

        subgraph Config["Configuration"]
            APIKeys["API Keys<br/>(per provider)"]
            TermContext["Terminal Context<br/>(cwd, os, shell)"]
            CustomInstr["Custom Instructions<br/>(raw/agent prompts)"]
            Vocabulary["Vocabulary<br/>(spoken→written)"]
        end

        subgraph Modes["Transcription Modes"]
            RawMode["RAW Mode<br/>Verbatim transcription"]
            AgentMode["AGENT Mode<br/>CLI command conversion"]
        end

        subgraph Providers["Provider Adapters"]
            direction TB

            GeminiAdapter["Gemini Adapter<br/>• gemini-2.0-flash<br/>• gemini-2.5-flash"]
            ElevenLabsAdapter["ElevenLabs Adapter<br/>• scribe_v1 (batch)"]
            LocalAdapter["Local Adapter<br/>• whisper-local-tiny<br/>• whisper-local-base<br/>• whisper-local-small<br/>• parakeet-local"]
        end
    end

    subgraph ElevenLabsRealtime["ElevenLabsRealtimeService"]
        WSConnect["WebSocket Connection<br/>wss://api.elevenlabs.io"]
        PCMCapture["PCM Capture<br/>(16kHz, 16-bit)"]
        VADCommit["VAD Auto-Commit"]
    end

    subgraph ExternalAPIs["External APIs"]
        GeminiAPI["Google Gemini API"]
        ElevenLabsAPI["ElevenLabs API"]
    end

    subgraph LocalServices["Local Services (Main Process)"]
        WhisperCPP["whisper.cpp"]
        Parakeet["Parakeet Server<br/>(localhost:8003)"]
    end

    Manual --> TranscriptionService
    VAD --> TranscriptionService
    Realtime --> ElevenLabsRealtime

    Config --> Modes
    Modes --> Providers

    GeminiAdapter --> GeminiAPI
    ElevenLabsAdapter --> ElevenLabsAPI
    LocalAdapter --> LocalServices

    ElevenLabsRealtime --> ElevenLabsAPI
```

---

## Terminal Multi-Tab Architecture

```mermaid
flowchart TB
    subgraph Renderer["Renderer Process"]
        TabBar2["TabBar Component"]
        TerminalComp["Terminal Component<br/>(per tab)"]
        LayoutMgr["Layout Manager<br/>(single/split/grid)"]
    end

    subgraph IPC2["IPC Bridge"]
        CreateTerm["create-terminal"]
        CloseTerm["close-terminal"]
        TermWrite["terminal-write"]
        TermData["terminal-data"]
        TermResize["terminal-resize"]
        GetContext["get-terminal-context"]
    end

    subgraph MainProcess2["Main Process"]
        subgraph PTYManager["PTY Manager"]
            PTYPool2["PTY Pool<br/>Map&lt;tabId, pty&gt;"]
            MaxTabs["Max Tabs: 4"]
        end

        subgraph PerPTY["Per PTY Instance"]
            PTYProcess["ptyProcess<br/>(node-pty)"]
            OutputBuffer2["Output Buffer<br/>(2000 chars)"]
            CWDParser["CWD Parser<br/>(regex from prompt)"]
            ShellType["Shell Type<br/>(zsh/bash/PowerShell)"]
        end

        DirTracker["Directory Tracker<br/>• recentDirs[]<br/>• favoriteDirs[]"]
    end

    subgraph Shell["System Shell"]
        Zsh["zsh (macOS)"]
        Bash["bash (Linux)"]
        PowerShell["PowerShell (Windows)"]
    end

    TabBar2 -->|"onNewTab()"| CreateTerm
    TabBar2 -->|"onCloseTab()"| CloseTerm
    TerminalComp -->|"xterm.onData()"| TermWrite
    TerminalComp <--|"onTerminalData()"| TermData
    TerminalComp -->|"ResizeObserver"| TermResize
    LayoutMgr -->|"getContext()"| GetContext

    CreateTerm --> PTYPool2
    CloseTerm --> PTYPool2
    TermWrite --> PTYProcess
    PTYProcess --> TermData
    TermResize --> PTYProcess
    GetContext --> OutputBuffer2
    GetContext --> CWDParser

    PTYProcess <--> Zsh
    PTYProcess <--> Bash
    PTYProcess <--> PowerShell

    CWDParser --> DirTracker
```

---

## Keyboard Shortcut Flow

```mermaid
flowchart LR
    subgraph User["User Input"]
        Keyboard["Keyboard"]
    end

    subgraph MainProcess3["Main Process"]
        GlobalShortcut["globalShortcut API"]
        ShortcutRegistry["Shortcut Registry<br/>(shortcuts.json)"]
    end

    subgraph IPCSend["IPC Events"]
        ToggleRec["toggle-recording"]
        CancelRec["cancel-recording"]
        ToggleMode["toggle-mode"]
        ClearTerm["clear-terminal"]
        CycleLayout["cycle-layout"]
        FocusNext["focus-next-terminal"]
        FocusPrev["focus-prev-terminal"]
        BookmarkDir["bookmark-directory"]
        ResendLast["resend-last"]
        SwitchTab["switch-tab (1-4)"]
        TogglePrev["toggle-preview"]
        CaptureScreen["capture-screenshot"]
    end

    subgraph Renderer2["Renderer Handlers"]
        VoiceHandler["VoiceOverlay<br/>start/stop recording"]
        ModeHandler["App<br/>toggle agent/raw"]
        TermHandler["App<br/>send clear command"]
        LayoutHandler["App<br/>cycle layout mode"]
        FocusHandler["App<br/>change focused pane"]
        DirHandler["App<br/>bookmark CWD"]
        ResendHandler["App<br/>re-execute last"]
        TabHandler["App<br/>switch active tab"]
        PreviewHandler["App<br/>show/hide preview"]
        ScreenHandler["PreviewPane<br/>capture screenshot"]
    end

    Keyboard -->|"Alt+S"| GlobalShortcut
    Keyboard -->|"Alt+A"| GlobalShortcut
    Keyboard -->|"Alt+M"| GlobalShortcut
    Keyboard -->|"Alt+C"| GlobalShortcut
    Keyboard -->|"Alt+L"| GlobalShortcut
    Keyboard -->|"Alt+→"| GlobalShortcut
    Keyboard -->|"Alt+←"| GlobalShortcut
    Keyboard -->|"Alt+B"| GlobalShortcut
    Keyboard -->|"Alt+R"| GlobalShortcut
    Keyboard -->|"Alt+1-4"| GlobalShortcut
    Keyboard -->|"Alt+P"| GlobalShortcut
    Keyboard -->|"Alt+Shift+P"| GlobalShortcut

    GlobalShortcut --> ShortcutRegistry

    ShortcutRegistry --> ToggleRec --> VoiceHandler
    ShortcutRegistry --> CancelRec --> VoiceHandler
    ShortcutRegistry --> ToggleMode --> ModeHandler
    ShortcutRegistry --> ClearTerm --> TermHandler
    ShortcutRegistry --> CycleLayout --> LayoutHandler
    ShortcutRegistry --> FocusNext --> FocusHandler
    ShortcutRegistry --> FocusPrev --> FocusHandler
    ShortcutRegistry --> BookmarkDir --> DirHandler
    ShortcutRegistry --> ResendLast --> ResendHandler
    ShortcutRegistry --> SwitchTab --> TabHandler
    ShortcutRegistry --> TogglePrev --> PreviewHandler
    ShortcutRegistry --> CaptureScreen --> ScreenHandler
```

---

## Complete Shortcut Reference

| Shortcut | Channel | Handler | Action |
|----------|---------|---------|--------|
| `Alt+S` | toggle-recording | VoiceOverlay | Start/stop voice recording |
| `Alt+A` | cancel-recording | VoiceOverlay | Cancel recording without transcribing |
| `Alt+M` | toggle-mode | App | Switch between raw/agent mode |
| `Alt+H` | (direct) | Main | Show/hide window |
| `Alt+C` | clear-terminal | App | Clear terminal (cls/clear) |
| `Alt+L` | cycle-layout | App | Cycle: single→split-h→split-v→grid-2x2→grid-3 |
| `Alt+→` | focus-next-terminal | App | Focus next pane in split view |
| `Alt+←` | focus-prev-terminal | App | Focus previous pane in split view |
| `Alt+B` | bookmark-directory | App | Add current directory to favorites |
| `Alt+R` | resend-last | App | Re-execute last transcription |
| `Alt+1-4` | switch-tab | App | Switch to tab by index |
| `Alt+P` | toggle-preview | App | Show/hide preview pane |
| `Alt+Shift+P` | capture-screenshot | PreviewPane | Capture screenshot of preview |

---

## File Structure Map

```
audiobash/
├── electron/                          # Main Process
│   ├── main.cjs                      # Entry point (1500+ lines)
│   │   ├── Window management
│   │   ├── PTY management
│   │   ├── IPC handlers (38+)
│   │   ├── AI client initialization
│   ├── preload.cjs                   # IPC Bridge (53 APIs)
│   ├── logger.cjs                    # Main process logging
│   ├── error-handler.cjs             # Global error handlers
│   └── whisperService.cjs            # Local Whisper
│
├── src/                               # Renderer Process
│   ├── index.tsx                     # React entry point
│   ├── index.css                     # Global styles + Tailwind
│   ├── App.tsx                       # Main component (30KB)
│   ├── types.ts                      # TypeScript interfaces
│   │
│   ├── components/                    # UI Components (17)
│   │   ├── TitleBar.tsx              # Window controls
│   │   ├── TabBar.tsx                # Tab management
│   │   ├── Terminal.tsx              # xterm.js wrapper
│   │   ├── VoiceOverlay.tsx          # Voice recording panel
│   │   ├── Settings.tsx              # Settings modal
│   │   ├── DirectoryPicker.tsx       # Directory navigation
│   │   ├── PreviewPane.tsx           # Web preview
│   │   ├── PreviewControls.tsx       # Preview toolbar
│   │   ├── PreviewRenderer.tsx       # Content renderer
│   │   ├── SplitContainer.tsx        # Layout grid
│   │   ├── ResizeDivider.tsx         # Pane resizer
│   │   ├── LayoutSelector.tsx        # Layout buttons
│   │   ├── FocusIndicator.tsx        # Recording badge
│   │   ├── StatusIndicator.tsx       # Status bar
│   │   ├── ConsoleErrorViewer.tsx    # Error display
│   │   ├── Onboarding.tsx            # Welcome wizard
│   │   └── ErrorBoundary.tsx         # Error catch
│   │
│   ├── services/                      # Business Logic
│   │   ├── transcriptionService.ts   # Multi-provider transcription
│   │   └── elevenLabsRealtimeService.ts # WebSocket streaming
│   │
│   ├── hooks/                         # Custom React Hooks
│   │   ├── useVAD.ts                 # Voice activity detection
│   │   ├── useElevenLabsRealtime.ts  # Realtime transcription
│   │   ├── usePCMCapture.ts          # Audio capture
│   │   └── useFileWatcher.ts         # File change detection
│   │
│   ├── contexts/                      # React Context
│   │   └── ConsoleErrorContext.tsx   # Error capture
│   │
│   ├── themes/                        # Theming
│   │   ├── index.ts                  # Theme definitions
│   │   └── ThemeProvider.tsx         # Theme context
│   │
│   └── utils/                         # Utilities
│       ├── logger.ts                 # Structured logging
│       ├── audioFeedback.ts          # Sound effects
│       ├── audioUtils.ts             # Audio encoding
│       ├── audioConversion.ts        # Format conversion
│       └── notificationSound.ts      # CLI prompt detection
│
├── docs/                              # Documentation
├── tests/                             # Test files
├── assets/                            # Static assets
│
├── package.json                       # Dependencies & scripts
├── vite.config.ts                     # Bundler config
├── tailwind.config.js                 # CSS config
├── tsconfig.json                      # TypeScript config
└── vitest.config.ts                   # Test config
```

---

## Cost & Performance Reference

### Transcription Latency

| Provider | Model | Latency | Notes |
|----------|-------|---------|-------|
| Gemini | 2.0/2.5 Flash | 2-3s | Native audio support |
| ElevenLabs | Scribe (batch) | 2-3s | High quality |
| ElevenLabs | Scribe (realtime) | ~150ms | WebSocket streaming |
| Local | Whisper tiny | 5-10s | CPU dependent |
| Local | Whisper base | 8-15s | Better accuracy |
| Local | Whisper small | 10-20s | Best accuracy |
| Local | Parakeet | 3-5s | Requires NVIDIA GPU |

### Transcription Cost (per minute)

| Provider | Cost | Notes |
|----------|------|-------|
| Gemini | ~$0.0003 | Most cost-effective |
| ElevenLabs | $0.0067 | Same for batch/realtime |
| Local | $0.00 | One-time setup cost |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Exposed APIs** | 53 |
| **React Components** | 17 |
| **Custom Hooks** | 6 |
| **Transcription Models** | 7 |
| **AI Providers** | 3 |
| **Keyboard Shortcuts** | 15 |
| **Layout Modes** | 5 |
| **Max Terminal Tabs** | 4 |

---

*Generated by architecture analysis*
