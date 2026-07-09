import { createContext, useContext, type ReactNode } from 'react';
import type {
  PlaybackMode,
  ResolvedUiLanguage,
  TrackAvailability,
  SourceKind,
  UiLanguagePreference,
} from '@core';

export interface I18nStrings {
  language: ResolvedUiLanguage;
  common: {
    appName: string;
    addMusic: string;
    add: string;
    save: string;
    cancel: string;
    close: string;
    search: string;
    unknownError: string;
    notAvailable: string;
    tracks: (count: number) => string;
  };
  loading: {
    tagline: string;
  };
  nav: {
    brandEyebrow: string;
    brandSubtitle: string;
    quickPlaylists: string;
    quickPlaylistsEmpty: string;
    importSources: string;
    items: Record<'library' | 'playlists' | 'queue' | 'lyrics' | 'settings', {
      label: string;
      hint: string;
    }>;
  };
  page: {
    title: (view: 'library' | 'playlists' | 'queue' | 'lyrics' | 'settings') => string;
    subtitle: (
      view: 'library' | 'playlists' | 'queue' | 'lyrics' | 'settings',
      trackCount: number,
      playlistCount: number,
      rootCount: number,
    ) => string;
    searchPlaceholder: string;
    dragImportHint: string;
  };
  status: {
    scanningLibrary: string;
    scanProgress: (current: number, total: number, path: string) => string;
    libraryScanFinished: (added: number, updated: number) => string;
    scanComplete: (added: number, updated: number) => string;
    refreshingLibrary: string;
    refreshComplete: (added: number, updated: number) => string;
    removedTrack: string;
    shortcutSettingsSaved: string;
    trackOverridesSaved: string;
    trackAddedToPlaylist: string;
    importedFolders: (added: number, updated: number) => string;
    importedFiles: (added: number, updated: number) => string;
    addedDirectUrl: string;
    addedResolverTrack: (title: string) => string;
  };
  library: {
    empty: string;
    reveal: string;
    playlist: string;
    edit: string;
    remove: string;
  };
  playlists: {
    createTitle: string;
    createPlaceholder: string;
    createAction: string;
    listTitle: string;
    selectPrompt: string;
    detailSubtitle: string;
    rename: string;
    delete: string;
    empty: string;
    removeTrack: string;
  };
  queue: {
    empty: string;
  };
  lyrics: {
    emptyTrack: string;
    searchOnline: string;
    emptyLyrics: string;
  };
  settings: {
    languageTitle: string;
    languageDescription: string;
    languageLabel: string;
    followSystem: (current: string) => string;
    rootsTitle: string;
    rootsDescription: string;
    addFiles: string;
    addFolders: string;
    refreshLibrary: string;
    noRoots: string;
    lastScanned: (value: string | null | undefined) => string;
    desktopLyricsTitle: string;
    desktopLyricsDescription: string;
    showDesktopLyrics: string;
    hideDesktopLyrics: string;
    desktopLyricsAvailable: string;
    desktopLyricsUnavailable: string;
    shortcutsTitle: string;
    shortcutsDescription: string;
    togglePlayPause: string;
    nextTrack: string;
    previousTrack: string;
    toggleDesktopLyrics: string;
    saveShortcuts: string;
  };
  player: {
    nothingPlaying: string;
    startHint: string;
    playbackMode: string;
    openLyrics: string;
    desktopLyrics: string;
    volumeMode: (volume: number, mode: string) => string;
  };
  table: {
    track: string;
    source: string;
    status: string;
    time: string;
    format: string;
    actions: string;
  };
  import: {
    title: string;
    subtitle: string;
    localTab: string;
    urlTab: string;
    resolverTab: string;
    localTitle: string;
    localDescription: string;
    pickFolders: string;
    pickFiles: string;
    streamUrl: string;
    streamUrlPlaceholder: string;
    titleLabel: string;
    artistLabel: string;
    albumLabel: string;
    addDirectUrl: string;
    resolverSearchPlaceholder: string;
    searchAction: string;
    addResult: string;
    emptyResults: string;
  };
  editor: {
    title: string;
    subtitle: string;
    loading: string;
    titleLabel: string;
    artistLabel: string;
    albumLabel: string;
    composerLabel: string;
    durationLabel: string;
    artworkRefLabel: string;
    lyricRefLabel: string;
    lyricTextLabel: string;
    save: string;
  };
  addToPlaylist: {
    title: string;
    empty: string;
    addAction: string;
  };
  desktopWindow: {
    defaultArtist: string;
    defaultCurrentLine: string;
    defaultNextLine: string;
  };
  sourceKindLabel: (value: SourceKind) => string;
  availabilityLabel: (value: TrackAvailability) => string;
  playbackModeShortLabel: (mode: PlaybackMode | string) => string;
  playbackModeLabel: (mode: PlaybackMode | string) => string;
  languageOptionLabel: (value: UiLanguagePreference, currentResolved: ResolvedUiLanguage) => string;
}

const I18nContext = createContext<I18nStrings>(buildStrings('en-US'));

export function I18nProvider(props: { value: I18nStrings; children: ReactNode }) {
  return (
    <I18nContext.Provider value={props.value}>
      {props.children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function buildStrings(language: ResolvedUiLanguage): I18nStrings {
  return language === 'zh-CN' ? zhCN : enUS;
}

export function languageDisplayName(language: ResolvedUiLanguage): string {
  return language === 'zh-CN' ? '简体中文' : 'English';
}

const enUS: I18nStrings = {
  language: 'en-US',
  common: {
    appName: 'AlsoMusicPlayer',
    addMusic: 'Add Music',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    search: 'Search',
    unknownError: 'Unknown error',
    notAvailable: 'N/A',
    tracks: count => `${count} tracks`,
  },
  loading: {
    tagline: 'Rebuilding your desktop music library experience.',
  },
  nav: {
    brandEyebrow: 'Desktop Player',
    brandSubtitle: 'Source-aware local player with lyrics, queue, playlists and desktop overlays.',
    quickPlaylists: 'Quick Playlists',
    quickPlaylistsEmpty: 'Create a playlist to organize your library.',
    importSources: 'Import Sources',
    items: {
      library: { label: 'Library', hint: 'Browse your indexed collection' },
      playlists: { label: 'Playlists', hint: 'Curate listening flows' },
      queue: { label: 'Queue', hint: 'What is coming next' },
      lyrics: { label: 'Lyrics', hint: 'Synced reading mode' },
      settings: { label: 'Settings', hint: 'Library, shortcuts, desktop lyrics' },
    },
  },
  page: {
    title: view => ({
      library: 'Library',
      playlists: 'Playlists',
      queue: 'Queue',
      lyrics: 'Lyrics',
      settings: 'Settings',
    })[view],
    subtitle: (view, trackCount, playlistCount, rootCount) => {
      switch (view) {
        case 'playlists':
          return `${playlistCount} playlists ready for curated listening.`;
        case 'queue':
          return 'Review and jump through the current playback queue.';
        case 'lyrics':
          return 'Follow synced lyrics, or search online when local files do not have them.';
        case 'settings':
          return `${rootCount} remembered library roots and source-aware playback preferences.`;
        default:
          return `${trackCount} tracks indexed across local files, direct URLs and resolver sources.`;
      }
    },
    searchPlaceholder: 'Search tracks, artists, albums, composers...',
    dragImportHint: 'Drop local files or folders to import them into the indexed library.',
  },
  status: {
    scanningLibrary: 'Scanning library...',
    scanProgress: (current, total, path) => `Scanning ${current}/${total}: ${path}`,
    libraryScanFinished: (added, updated) => `Library scan finished. Added ${added}, updated ${updated}.`,
    scanComplete: (added, updated) => `Scan complete. Added ${added}, updated ${updated}.`,
    refreshingLibrary: 'Refreshing remembered folders...',
    refreshComplete: (added, updated) => `Refresh complete. Added ${added}, updated ${updated}.`,
    removedTrack: 'Removed track from library.',
    shortcutSettingsSaved: 'Shortcut settings saved.',
    trackOverridesSaved: 'Track overrides saved.',
    trackAddedToPlaylist: 'Track added to playlist.',
    importedFolders: (added, updated) => `Imported folders. Added ${added}, updated ${updated}.`,
    importedFiles: (added, updated) => `Imported files. Added ${added}, updated ${updated}.`,
    addedDirectUrl: 'Added direct URL source.',
    addedResolverTrack: title => `Added resolver track ${title}.`,
  },
  library: {
    empty: 'No tracks indexed yet. Add folders, files or links to start building the player.',
    reveal: 'Reveal',
    playlist: 'Playlist',
    edit: 'Edit',
    remove: 'Remove',
  },
  playlists: {
    createTitle: 'Create Playlist',
    createPlaceholder: 'Late-night instrumentals',
    createAction: 'Create Playlist',
    listTitle: 'Your Playlists',
    selectPrompt: 'Select a playlist to browse or build it from the library page.',
    detailSubtitle: 'Curate order, remove tracks, and start full-playlist playback.',
    rename: 'Rename',
    delete: 'Delete',
    empty: 'This playlist is empty. Add tracks from the library page.',
    removeTrack: 'Remove',
  },
  queue: {
    empty: 'Queue is empty. Double-click a track in the library to start playback.',
  },
  lyrics: {
    emptyTrack: 'Start playing a track to load synced lyrics and desktop lyric state.',
    searchOnline: 'Search Online',
    emptyLyrics: 'No lyrics available yet. Try the online search or add custom lyrics in the editor.',
  },
  settings: {
    languageTitle: 'Interface Language',
    languageDescription: 'Follow the system language by default, or lock the app to English or Simplified Chinese.',
    languageLabel: 'Language',
    followSystem: current => `Follow system (${current})`,
    rootsTitle: 'Indexed Library Roots',
    rootsDescription: 'Folders are remembered and rescanned. Individual files are indexed without being copied.',
    addFiles: 'Add Files',
    addFolders: 'Add Folders',
    refreshLibrary: 'Refresh Library',
    noRoots: 'No remembered folders yet. Add a library root to enable one-click refresh.',
    lastScanned: value => `Last scanned ${value ?? 'not yet'}`,
    desktopLyricsTitle: 'Desktop Lyrics',
    desktopLyricsDescription: 'Windows is fully targeted. Linux is supported when the window manager allows transparent always-on-top overlays.',
    showDesktopLyrics: 'Show Desktop Lyrics',
    hideDesktopLyrics: 'Hide Desktop Lyrics',
    desktopLyricsAvailable: 'Desktop lyrics window is available on this platform.',
    desktopLyricsUnavailable: 'Desktop lyrics window is not available on this platform build.',
    shortcutsTitle: 'Shortcut Preferences',
    shortcutsDescription: 'Local keyboard mappings are configurable today. Global registration is scaffolded but host-level activation is still conservative.',
    togglePlayPause: 'Toggle Play / Pause',
    nextTrack: 'Next Track',
    previousTrack: 'Previous Track',
    toggleDesktopLyrics: 'Toggle Desktop Lyrics',
    saveShortcuts: 'Save Shortcut Preferences',
  },
  player: {
    nothingPlaying: 'Nothing playing',
    startHint: 'Start from the library, playlists or queue.',
    playbackMode: 'Playback mode',
    openLyrics: 'Lyrics',
    desktopLyrics: 'Desktop Lyrics',
    volumeMode: (volume, mode) => `Volume ${volume}% · Mode ${mode}`,
  },
  table: {
    track: 'Track',
    source: 'Source',
    status: 'Status',
    time: 'Time',
    format: 'Format',
    actions: 'Actions',
  },
  import: {
    title: 'Import Sources',
    subtitle: 'Index local folders, add raw stream URLs, or bridge a resolver-backed public source.',
    localTab: 'Local Files',
    urlTab: 'Direct URL',
    resolverTab: 'Resolver Search',
    localTitle: 'Index Local Library Roots',
    localDescription: 'Folders are remembered for refresh. Files are indexed in place without being copied into app storage.',
    pickFolders: 'Pick Folders',
    pickFiles: 'Pick Files',
    streamUrl: 'Stream URL',
    streamUrlPlaceholder: 'https://example.com/audio/song.mp3',
    titleLabel: 'Title',
    artistLabel: 'Artist',
    albumLabel: 'Album',
    addDirectUrl: 'Add Direct URL',
    resolverSearchPlaceholder: 'Search Netease tracks...',
    searchAction: 'Search',
    addResult: 'Add',
    emptyResults: 'Search a public source to add resolver-backed tracks.',
  },
  editor: {
    title: 'Track Editor',
    subtitle: 'Overrides are stored in the app database and layered on top of scanned metadata.',
    loading: 'Loading track metadata...',
    titleLabel: 'Title',
    artistLabel: 'Artist',
    albumLabel: 'Album',
    composerLabel: 'Composer',
    durationLabel: 'Duration Seconds',
    artworkRefLabel: 'Artwork Ref',
    lyricRefLabel: 'Lyrics Ref',
    lyricTextLabel: 'Lyrics Text',
    save: 'Save Overrides',
  },
  addToPlaylist: {
    title: 'Add to Playlist',
    empty: 'Create a playlist first from the Playlists view.',
    addAction: 'Add',
  },
  desktopWindow: {
    defaultArtist: 'Desktop Lyrics',
    defaultCurrentLine: 'Play a track to start desktop lyrics.',
    defaultNextLine: 'You can control playback from this floating window.',
  },
  sourceKindLabel: value => ({
    local_file: 'Local File',
    direct_url: 'Direct URL',
    resolver: 'Resolver',
  })[value],
  availabilityLabel: value => ({
    available: 'Available',
    missing: 'Missing',
    unresolved: 'Needs Resolve',
  })[value],
  playbackModeShortLabel: mode => ({
    sequential: 'SEQ',
    shuffle: 'SHF',
    repeat_one: 'R1',
    repeat_all: 'ALL',
  })[mode as PlaybackMode] ?? 'SEQ',
  playbackModeLabel: mode => ({
    sequential: 'Sequential',
    shuffle: 'Shuffle',
    repeat_one: 'Repeat One',
    repeat_all: 'Repeat All',
  })[mode as PlaybackMode] ?? 'Sequential',
  languageOptionLabel: (value, currentResolved) => {
    if (value === 'system') {
      return `Follow system (${languageDisplayName(currentResolved)})`;
    }
    return value === 'zh-CN' ? '简体中文' : 'English';
  },
};

const zhCN: I18nStrings = {
  language: 'zh-CN',
  common: {
    appName: 'AlsoMusicPlayer',
    addMusic: '添加音乐',
    add: '添加',
    save: '保存',
    cancel: '取消',
    close: '关闭',
    search: '搜索',
    unknownError: '未知错误',
    notAvailable: '不可用',
    tracks: count => `${count} 首曲目`,
  },
  loading: {
    tagline: '正在重建更像桌面播放器的音乐库体验。',
  },
  nav: {
    brandEyebrow: '桌面播放器',
    brandSubtitle: '以来源模型为核心的本地播放器，支持歌词、队列、歌单和桌面歌词。',
    quickPlaylists: '快捷歌单',
    quickPlaylistsEmpty: '先创建一个歌单来整理你的媒体库。',
    importSources: '导入来源',
    items: {
      library: { label: '媒体库', hint: '浏览已索引的曲目' },
      playlists: { label: '歌单', hint: '整理你的播放流' },
      queue: { label: '队列', hint: '查看接下来播放什么' },
      lyrics: { label: '歌词', hint: '同步歌词阅读模式' },
      settings: { label: '设置', hint: '媒体库、快捷键、桌面歌词' },
    },
  },
  page: {
    title: view => ({
      library: '媒体库',
      playlists: '歌单',
      queue: '队列',
      lyrics: '歌词',
      settings: '设置',
    })[view],
    subtitle: (view, trackCount, playlistCount, rootCount) => {
      switch (view) {
        case 'playlists':
          return `当前共有 ${playlistCount} 个歌单。`;
        case 'queue':
          return '查看当前播放队列，并在其中快速跳转。';
        case 'lyrics':
          return '跟随同步歌词；如果本地没有歌词，也可以在线搜索。';
        case 'settings':
          return `当前记住了 ${rootCount} 个媒体库目录，以及来源感知的播放设置。`;
        default:
          return `已索引 ${trackCount} 首曲目，涵盖本地文件、直链和解析来源。`;
      }
    },
    searchPlaceholder: '搜索曲目、艺术家、专辑、作曲者...',
    dragImportHint: '将本地文件或文件夹拖到窗口中即可导入到已索引媒体库。',
  },
  status: {
    scanningLibrary: '正在扫描媒体库...',
    scanProgress: (current, total, path) => `正在扫描 ${current}/${total}: ${path}`,
    libraryScanFinished: (added, updated) => `媒体库扫描完成。新增 ${added} 首，更新 ${updated} 首。`,
    scanComplete: (added, updated) => `扫描完成。新增 ${added} 首，更新 ${updated} 首。`,
    refreshingLibrary: '正在刷新已记住的目录...',
    refreshComplete: (added, updated) => `刷新完成。新增 ${added} 首，更新 ${updated} 首。`,
    removedTrack: '已从媒体库移除曲目。',
    shortcutSettingsSaved: '快捷键设置已保存。',
    trackOverridesSaved: '曲目信息覆盖已保存。',
    trackAddedToPlaylist: '已将曲目加入歌单。',
    importedFolders: (added, updated) => `已导入文件夹。新增 ${added} 首，更新 ${updated} 首。`,
    importedFiles: (added, updated) => `已导入文件。新增 ${added} 首，更新 ${updated} 首。`,
    addedDirectUrl: '已添加直链来源。',
    addedResolverTrack: title => `已添加解析来源曲目 ${title}。`,
  },
  library: {
    empty: '还没有已索引的曲目。添加文件夹、文件或链接来开始构建播放器。',
    reveal: '打开位置',
    playlist: '加入歌单',
    edit: '编辑',
    remove: '移除',
  },
  playlists: {
    createTitle: '创建歌单',
    createPlaceholder: '深夜器乐',
    createAction: '创建歌单',
    listTitle: '你的歌单',
    selectPrompt: '先选择一个歌单，或在媒体库页面继续补充它。',
    detailSubtitle: '整理顺序、移除曲目，并从整个歌单开始播放。',
    rename: '重命名',
    delete: '删除',
    empty: '这个歌单还是空的。去媒体库页面添加一些曲目吧。',
    removeTrack: '移除',
  },
  queue: {
    empty: '播放队列为空。双击媒体库中的曲目即可开始播放。',
  },
  lyrics: {
    emptyTrack: '先播放一首曲目，才能加载同步歌词和桌面歌词状态。',
    searchOnline: '在线搜索',
    emptyLyrics: '暂时还没有歌词。可以尝试在线搜索，或在编辑器里手动添加。',
  },
  settings: {
    languageTitle: '界面语言',
    languageDescription: '默认跟随系统语言，也可以手动固定为 English 或简体中文。',
    languageLabel: '语言',
    followSystem: current => `跟随系统（当前：${current}）`,
    rootsTitle: '已索引媒体库目录',
    rootsDescription: '目录会被记住并重新扫描；单个文件会原位索引，不会复制进应用目录。',
    addFiles: '添加文件',
    addFolders: '添加文件夹',
    refreshLibrary: '刷新媒体库',
    noRoots: '还没有已记住的目录。添加一个媒体库根目录后，就能一键刷新了。',
    lastScanned: value => `上次扫描：${value ?? '尚未扫描'}`,
    desktopLyricsTitle: '桌面歌词',
    desktopLyricsDescription: 'Windows 为完整目标平台。Linux 会在窗口管理器允许透明置顶覆盖时启用。',
    showDesktopLyrics: '显示桌面歌词',
    hideDesktopLyrics: '隐藏桌面歌词',
    desktopLyricsAvailable: '当前平台支持桌面歌词窗口。',
    desktopLyricsUnavailable: '当前平台构建不支持桌面歌词窗口。',
    shortcutsTitle: '快捷键设置',
    shortcutsDescription: '当前先支持本地键位映射。全局快捷键保留了宿主层接口，但默认仍偏保守。',
    togglePlayPause: '播放 / 暂停',
    nextTrack: '下一首',
    previousTrack: '上一首',
    toggleDesktopLyrics: '切换桌面歌词',
    saveShortcuts: '保存快捷键设置',
  },
  player: {
    nothingPlaying: '当前没有正在播放的音乐',
    startHint: '从媒体库、歌单或队列开始播放吧。',
    playbackMode: '播放模式',
    openLyrics: '歌词',
    desktopLyrics: '桌词',
    volumeMode: (volume, mode) => `音量 ${volume}% · 模式 ${mode}`,
  },
  table: {
    track: '曲目',
    source: '来源',
    status: '状态',
    time: '时长',
    format: '格式',
    actions: '操作',
  },
  import: {
    title: '导入来源',
    subtitle: '索引本地目录，添加原始音频直链，或桥接解析型公共来源。',
    localTab: '本地文件',
    urlTab: '音频直链',
    resolverTab: '解析搜索',
    localTitle: '索引本地媒体库目录',
    localDescription: '文件夹会被记住用于后续刷新；文件会原位索引，不会被复制到应用存储。',
    pickFolders: '选择文件夹',
    pickFiles: '选择文件',
    streamUrl: '音频直链',
    streamUrlPlaceholder: 'https://example.com/audio/song.mp3',
    titleLabel: '标题',
    artistLabel: '艺术家',
    albumLabel: '专辑',
    addDirectUrl: '添加直链',
    resolverSearchPlaceholder: '搜索网易云曲目...',
    searchAction: '搜索',
    addResult: '添加',
    emptyResults: '搜索公共来源，把解析型曲目添加到播放器。',
  },
  editor: {
    title: '曲目信息编辑器',
    subtitle: '覆盖信息会写入应用数据库，并叠加在扫描到的元数据之上。',
    loading: '正在加载曲目信息...',
    titleLabel: '标题',
    artistLabel: '艺术家',
    albumLabel: '专辑',
    composerLabel: '作曲',
    durationLabel: '时长（秒）',
    artworkRefLabel: '封面引用',
    lyricRefLabel: '歌词引用',
    lyricTextLabel: '歌词文本',
    save: '保存覆盖',
  },
  addToPlaylist: {
    title: '加入歌单',
    empty: '请先在歌单页面创建一个歌单。',
    addAction: '添加',
  },
  desktopWindow: {
    defaultArtist: '桌面歌词',
    defaultCurrentLine: '播放一首歌后，这里会开始显示桌面歌词。',
    defaultNextLine: '你也可以在这个浮窗里直接控制播放。',
  },
  sourceKindLabel: value => ({
    local_file: '本地文件',
    direct_url: '音频直链',
    resolver: '解析来源',
  })[value],
  availabilityLabel: value => ({
    available: '可播放',
    missing: '文件缺失',
    unresolved: '待解析',
  })[value],
  playbackModeShortLabel: mode => ({
    sequential: '顺序',
    shuffle: '随机',
    repeat_one: '单曲',
    repeat_all: '循环',
  })[mode as PlaybackMode] ?? '顺序',
  playbackModeLabel: mode => ({
    sequential: '顺序播放',
    shuffle: '随机播放',
    repeat_one: '单曲循环',
    repeat_all: '列表循环',
  })[mode as PlaybackMode] ?? '顺序播放',
  languageOptionLabel: (value, currentResolved) => {
    if (value === 'system') {
      return `跟随系统（当前：${languageDisplayName(currentResolved)}）`;
    }
    return value === 'zh-CN' ? '简体中文' : 'English';
  },
};
