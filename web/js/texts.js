// Všechny texty rozhraní na jednom místě (příprava na případný další jazyk).
// Zástupné znaky {0}, {1}… nahrazuje funkce format().

export const TEXTS = {
    appName: "My Movie Diary",
    tagline: "Track every movie universe you love.",

    // Navigace
    navUniverses: "Universes",
    navSignIn: "Sign in",
    navRegister: "Register",
    navSignOut: "Sign out",
    navProfile: "Profile",

    // Obecné
    loading: "Loading…",
    errorGeneric: "Something went wrong: {0}",
    retry: "Try again",
    back: "← All universes",

    // Režim
    themeToLight: "Switch to light mode",
    themeToDark: "Switch to dark mode",

    // Hero karta na přehledu
    heroGuestEyebrow: "Your movie diary",
    heroGuestTitle: "Every universe. Every movie.",
    heroGuestText: "Log what you watch across the MCU, Star Wars, Studio Ghibli and more – and always know what to watch next.",
    heroWelcomeEyebrow: "Welcome back",
    heroWelcomeTitle: "Where do we start?",
    heroWelcomeText: "Pick a universe below and log your first movie.",
    continueEyebrow: "Continue · {0}",
    openUniverse: "Open universe",
    markWatched: "Mark as watched",

    // Up next v detailu univerza
    upNext: "Up next",
    universeComplete: "Universe complete",
    universeCompleteText: "You have seen every movie here. Time for a rewatch?",
    complete: "Complete",

    // Přehled univerz
    universesTitle: "Universes",
    universesCount: "{0} universes",
    universesIntro: "Pick a universe and start logging what you have watched.",
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
    universeNotFound: "This universe doesn't exist.",

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

    // Nenalezeno
    notFoundTitle: "Page not found",
    notFoundText: "There is nothing here.",

    // Patička (podmínka TMDB)
    tmdbAttribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
};

/** Vrátí text podle klíče a dosadí parametry: format("movieCount", 12) → "12 movies". */
export function format(key, ...args) {
    const template = TEXTS[key] ?? `???${key}???`;
    return template.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
}
