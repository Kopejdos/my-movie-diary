// Všechny texty rozhraní na jednom místě (příprava na případný další jazyk).
// Zástupné znaky {0}, {1}… nahrazuje funkce format().

export const TEXTS = {
    appName: "My Movie Diary",
    tagline: "Track every movie collection you love.",

    // Navigace
    navUniverses: "Collections",
    navSignIn: "Sign in",
    navRegister: "Register",
    navSignOut: "Sign out",
    navProfile: "Profile",

    // Obecné
    loading: "Loading…",
    errorGeneric: "Something went wrong: {0}",
    retry: "Try again",
    back: "← All collections",

    // Režim
    themeToLight: "Switch to light mode",
    themeToDark: "Switch to dark mode",

    // Hero karta na přehledu
    heroGuestEyebrow: "Your movie diary",
    heroGuestTitle: "Every collection. Every movie.",
    heroGuestText: "Log what you watch across the MCU, Star Wars, Studio Ghibli and more – and always know what to watch next.",
    heroWelcomeEyebrow: "Welcome back",
    heroWelcomeTitle: "Where do we start?",
    heroWelcomeText: "Pick a collection below and log your first movie.",
    continueEyebrow: "Continue · {0}",
    openUniverse: "Open collection",
    markWatched: "Mark as watched",

    // Řazení a filtr v detailu univerza
    orderRelease: "Release order",
    orderStory: "Story order",
    unwatchedOnly: "Unwatched only",
    filterEmpty: "Nothing left to watch here. 🎉",

    // Vyhledávání
    navSearch: "Search",
    searchTitle: "Search",
    searchPlaceholder: "Search movies and collections…",
    searchClear: "Clear search",
    searchIntro: "Find any of the {0} in {1} – by title, collection or year.",
    searchExamples: ["alien", "ghibli", "spiderman", "harry potter", "2024"],
    searchShortcutHint: "Tip: press / anywhere in the app to search.",
    searchShortcut: "Search (press /)",
    searchCollections: "Collections",
    searchMovies: "Movies",
    searchNoResults: "Nothing found for “{0}”.",
    searchNoResultsHint: "Only movies that are part of a collection can be found.",
    searchMore: "Showing the first {0} of {1} movies – keep typing to narrow it down.",
    searchFilterAll: "All",
    searchFilterUnwatched: "Unwatched",
    searchFilterWatched: "Watched",
    searchFilterEmpty: "No movies match this filter.",

    // Watchlist
    navWatchlist: "Watchlist",
    watchlistTitle: "Watchlist",
    watchlistIntro: "Movies you want to watch. Once you mark one as watched, it leaves the list on its own.",
    watchlistEmpty: "Your watchlist is empty. Tap ☆ next to any movie to add it here.",
    watchlistCount: "{0} movies",
    watchlistAdd: "Add to watchlist",
    watchlistRemove: "Remove from watchlist",
    watchlistAdded: "Added to your watchlist.",
    watchlistRemoved: "Removed from your watchlist.",
    watchlistWatched: "Marked as watched.",
    watchlistBrowse: "Browse collections",
    watchlistAddedOn: "Added {0}",

    // Úrovně a XP
    levelLabel: "Level {0}",
    levelXp: "{0} XP",
    levelToNext: "{0} XP to level {1}",
    levelBreakdownFilms: "Movies",
    levelBreakdownRewatches: "Rewatches",
    levelBreakdownCollections: "Collections",
    levelBreakdownAchievements: "Achievements",
    levelUp: "⬆️ Level up! Level {0} – {1}",
    levelHowTo: "+10 XP per new movie · +3 per rewatch · +100 per completed collection · +25 to +200 per achievement level",

    // Achievementy
    achievementsTitle: "Achievements",
    achievementsSummary: "{0} / {1} unlocked",
    achievementsCompleted: "Completed collections",
    achievementsCompletedEmpty: "Finish a whole collection to see it here.",
    achievementUnlocked: "🏆 Achievement unlocked: {0}",
    achievementCollectionDone: "🏆 Collection complete: {0}",
    achievementUnlockedOn: "Unlocked {0}",
    achievementNext: "Next: {0}",
    achievementAllDone: "All levels unlocked!",
    achFirstName: "First Steps",
    achFirstDesc: "Log your first movie.",
    achCollectorName: "Collector",
    achCollectorDesc: "Watch {0} different movies.",
    achScreenTimeName: "Screen Time",
    achScreenTimeDesc: "Spend {0} hours watching movies.",
    achMarathonName: "Marathon",
    achMarathonDesc: "Watch {0} movies in a single day.",
    achRewatcherName: "Rewatcher",
    achRewatcherDesc: "Watch the same movie {0} times.",
    achCompletionistName: "Completionist",
    achCompletionistDesc: "Complete {0} collections.",
    achFanName: "{0} Fan",
    achFanDesc: "Complete {0} {1} collections.",
    achUnitFilms: "{0} / {1} movies",
    achUnitHours: "{0} / {1} hours",
    achUnitDay: "best day: {0} / {1}",
    achUnitRewatch: "most watched: {0}× / {1}×",
    achUnitCollections: "{0} / {1} collections",

    // Aplikace (PWA)
    install: "Install",
    installTitle: "Install the app",
    installText: "Add My Movie Diary to your home screen – it opens full screen like a normal app.",
    installButton: "Install My Movie Diary",
    installIos: "On iPhone or iPad: tap Share in Safari, then “Add to Home Screen”.",
    installOther: "In Chrome or Edge, use the install icon in the address bar or the browser menu → “Install app”.",
    installDone: "Installed – you are using the app. ✓",
    installThanks: "Thanks for installing My Movie Diary!",
    offline: "You are offline – changes will not be saved.",
    updateAvailable: "A new version of My Movie Diary is available.",
    updateReload: "Reload",
    online: "Back online.",

    // Up next v detailu univerza
    upNext: "Up next",
    universeComplete: "Collection complete",
    universeCompleteText: "You have seen every movie here. Time for a rewatch?",
    complete: "Complete",

    // Přehled univerz
    universesTitle: "Collections",
    categoryAll: "All",
    kindSeries: "Series",
    kindStudio: "Studios",
    kindGenre: "Genre picks",
    kindGenreHint: "Hand-picked essentials of the genre.",
    universesCount: "{0} collections",
    universesIntro: "Pick a collection and start logging what you have watched.",
    universesGuestHint: "Sign in to track your progress.",
    movieCount: "{0} movies",
    progressCount: "{0} / {1} watched",
    progressDone: "Complete!",

    // Detail univerza
    optionalBadge: "Optional",
    optionalHint: "Optional movies don't count towards progress.",
    watchedTimes: "Watched {0}×",
    notWatched: "Not watched",
    lastWatched: "Last: {0}",
    addWatch: "Add a viewing",
    removeWatch: "Remove the latest viewing",
    signInToTrack: "Sign in to track",
    minutes: "{0} min",
    universeNotFound: "This collection doesn't exist.",

    // Přihlášení a registrace
    signInTitle: "Sign in",
    registerTitle: "Create an account",
    email: "Email",
    emailOrNickname: "Email or nickname",
    password: "Password",
    passwordRepeat: "Repeat password",
    username: "Nickname",
    usernameHint: "3–24 characters: letters, numbers, _ and -",
    passwordHint: "At least {0} characters",
    submitSignIn: "Sign in",
    submitRegister: "Create account",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    errorUsernameFormat: "The nickname must have 3–24 characters: letters, numbers, _ and -.",
    errorUsernameTaken: "This nickname is already taken.",
    errorEmail: "Enter a valid email address.",
    errorPasswordShort: "The password must have at least {0} characters.",
    errorPasswordMismatch: "The passwords don't match.",
    errorInvalidLogin: "Wrong login or password.",
    registerCheckEmail: "Almost done! Check your inbox and confirm your email, then sign in.",
    welcome: "Welcome, {0}!",
    signedOut: "You have been signed out.",

    continueWithGoogle: "Continue with Google",
    or: "or",

    // Profil
    profileTitle: "Your profile",
    profileIntro: "Signed in as {0}.",
    profileChooseNickname: "Pick a nickname – your friends will see it later.",
    profileSave: "Save nickname",
    profileSaved: "Nickname saved.",
    profileAdmin: "Administrator",

    // Admin panel
    navAdmin: "Admin",
    adminTitle: "Admin panel",
    adminTabUniverses: "Collections",
    adminTabUsers: "Users",
    adminOnly: "This page is for administrators only.",
    adminNewUniverse: "New collection",
    adminName: "Name",
    adminNameRequired: "Enter a name.",
    adminSlug: "Address (slug)",
    adminKind: "Type",
    adminCategories: "Categories",
    adminCategoriesHint: "Where the collection shows up on the overview. It can be in more than one.",
    adminSlugHint: "Lowercase letters, numbers and dashes – used in the link, e.g. star-wars",
    adminColor: "Color",
    adminDescription: "Description",
    adminCreate: "Create collection",
    adminCreated: "Collection created.",
    adminSave: "Save",
    adminSaved: "Saved.",
    adminEdit: "Edit",
    adminDelete: "Delete",
    adminMoveUp: "Move up",
    adminMoveDown: "Move down",
    adminMovies: "{0} movies",
    adminConfirmDeleteUniverse: "Delete the collection \"{0}\"? Movies stay in the database, only the collection and its list are removed.",
    adminDeleted: "Deleted.",
    adminBackToPanel: "← Admin panel",
    adminOpenUniverse: "View collection",
    adminUniverseDetails: "Collection details",
    adminMoviesInUniverse: "Movies in this collection",
    adminGroup: "Group",
    adminGroupPlaceholder: "e.g. Phase 1",
    adminStoryOrder: "Story #",
    adminStoryHint: "Story # = position in the chronological (story) order. Leave empty to use the release order.",
    adminOptional: "Optional",
    adminSetCover: "Use as cover",
    adminIsCover: "Cover",
    adminRemove: "Remove",
    adminConfirmRemoveMovie: "Remove \"{0}\" from this collection?",
    adminAddMovie: "Add a movie",
    adminSearchPlaceholder: "Search TMDB, e.g. Iron Man",
    adminSearch: "Search",
    adminNoResults: "No movies found.",
    adminAdd: "Add",
    adminAlreadyIn: "Already added",
    adminMovieAdded: "\"{0}\" added.",
    adminNotReleased: "Not released yet ({0}) – it will still be added.",
    adminUsersCount: "{0} users",
    adminWatches: "{0} viewings",
    adminJoined: "Joined {0}",
    adminMakeAdmin: "Make admin",
    adminRemoveAdmin: "Remove admin",
    adminYou: "You",
    adminConfirmDeleteUser: "Permanently delete the account \"{0}\" and all of its viewings?",

    // Nenalezeno
    notFoundTitle: "Page not found",
    notFoundText: "There is nothing here.",

    // Patička (podmínka TMDB)
    tmdbAttribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
};

/** „1 collection“ / „12 collections“. */
export function collections(count) {
    return count === 1 ? "1 collection" : `${count} collections`;
}

/** „1 movie“ / „12 movies“ – správné číslo podle počtu. */
export function movies(count) {
    return count === 1 ? "1 movie" : `${count} movies`;
}

/** Vrátí text podle klíče a dosadí parametry: format("movieCount", 12) → "12 movies". */
export function format(key, ...args) {
    const template = TEXTS[key] ?? `???${key}???`;
    return template.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
}
