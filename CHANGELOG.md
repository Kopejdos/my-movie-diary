# Changelog

All notable changes to My Movie Diary. Versions follow **V<major>.<minor>.<patch>** –
see [docs/decisions.md](docs/decisions.md#verzování) for the rules.

## V2.1.1 – November 2026
- Nothing jumps around while the page loads anymore
- The overview starts loading right away, in parallel with signing in
- Less JavaScript at startup: admin, search, stats and profile load when you first open them

## V2.1 – November 2026
- Faster: posters and banners load in the right size (much less data on phones)
- Collections, categories and movies are kept in memory – going back and forth is instant
- Opening a collection needs one request instead of two, and starts loading as soon as you hover or touch its card
- After every +1 only your viewings are reloaded, not the whole catalog

## V2.0 – November 2026
- Public profiles: make your diary public and share a link – level, achievements and stats, viewable even without an account
- Share button: system share sheet on phones, copy link on desktop
- Find friends: People in search (public profiles only)
- Profiles stay private unless you switch them to Public; your watchlist and email are never shown
- Privacy policy updated

## V1.9 – November 2026
- Stats page on your profile: movies seen, viewings, time watched, collections done and your longest streak
- Activity over the last 12 months and per year, most watched movies, movies by release decade and by category
- "Almost there" – collections you're closest to finishing, plus fun facts (longest, oldest, busiest day…)
- Achievements | Stats switch on the profile

## V1.8 – November 2026
- Paths: curated routes you watch step by step, with a short note on why each movie matters
- 6 paths: MCU Essentials, Star Wars: First Watch, Superhero Hall of Fame, Fantasy Starter, Animation Essentials, Horror 101
- Numbered steps, "Next step" card and a Pathfinder achievement
- Admin panel: Path type and step notes

## V1.7.1 – November 2026
- Fixed two wrong movie matches (Audition, Hostel)

## V1.7 – November 2026
- Final horror wave: Gore & Splatter, Extreme & Torture, Cosmic Horror, Gothic Horror, Giallo, Eco-horror, Elevated Horror
- Bonus: J-Horror

## V1.6 – November 2026
- Search: find movies and collections by title, original title or year – instant results as you type
- Results show every collection a movie belongs to, plus the viewing counter and watchlist star
- All / Unwatched / Watched filter, search icon in the header, search bar on the overview, press / to search

## V1.5.1 – November 2026
- Body Horror: fixed two wrong movie matches (Society, Raw)

## V1.5 – November 2026
- 7 more horror genre picks: Body Horror, Creature Feature, Vampire, Werewolf, Sci-fi Horror, Folk Horror, Horror Comedy

## V1.4.1 – November 2026
- Faster loading: Supabase library and fonts bundled with the app, all modules preloaded at once
- Instant reopening from cache; "new version available – Reload" prompt after an update
- The overview shows collections right away and fills in "Continue watching" when ready

## V1.4 – November 2026
- Levels and XP: earn XP for movies, rewatches, completed collections and achievements
- Movie-themed titles from Extra to Legend, level badge next to your nickname, level-up notifications
- Insidious: Out of the Further added to the Insidious collection

## V1.3 – November 2026
- Achievements on your profile: First Steps, Collector, Screen Time, Marathon, Rewatcher, Completionist and a Fan badge for every category
- Bronze / Silver / Gold / Platinum levels with unlock dates and progress to the next level
- Completed collections shown as badges
- "Achievement unlocked" notifications

## V1.2.1 – November 2026
- Import script (`scripts/import.sh`) with reports in `import-reports/`
- "1 collection" instead of "1 collections"

## V1.2 – November 2026
- Categories on the overview: Superhero, Sci-fi & Fantasy, Animation, Action & Adventure, Horror
- Collections grouped into Series, Studios and Genre picks
- 8 horror series: The Conjuring Universe, Saw, Scream, Halloween, Final Destination, Insidious, A Nightmare on Elm Street, Friday the 13th
- 7 horror genre picks: Slasher, Supernatural & Paranormal, Haunted House, Demonic & Exorcism, Psychological Horror, Found Footage, Zombie
- Admin panel: collection type and categories

## V1.1.1 – November 2026
- "Universes" are now called "Collections" (they include studios and genre picks too); old links still work

## V1.1 – November 2026
- New universes: Mad Max, Avatar, Disney Animation (with optional live-action remakes), Pixar, DreamWorks Animation
- App version and last update shown in the footer

## V1.0 – November 2026
- Installable app (PWA): home-screen icon, full-screen mode, opens offline
- New versions load automatically after a deploy (service worker)

## V0.7 – November 2026
- Watchlist: ☆ next to every movie and a Watchlist page; watched movies leave the list on their own

## V0.6 – November 2026
- Release order / story order (MCU, Star Wars, X-Men, Alien)
- "Unwatched only" filter

## V0.5 – November 2026
- Admin panel: universes, movies (TMDB search) and users

## V0.4 – November 2026
- Redesign: Chakra Petch headings, universe colors, banners, Up next, Continue watching
- Light and dark mode

## V0.3 – November 2026
- Universe overview with progress, universe detail with groups, +1 / −1 viewing counter

## V0.2 – November 2026
- Registration and sign-in (email or nickname), Google sign-in, profile, privacy policy
- The Maze Runner universe

## V0.1 – November 2026
- Database, access rules and keep-alive
- 16 universes and 200+ movies imported from TMDB

## V0.0 – November 2026
- Repository, GitHub Pages, Supabase project
