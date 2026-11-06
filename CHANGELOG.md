# Changelog

All notable changes to My Movie Diary. Versions follow **V<major>.<minor>.<patch>** –
see [docs/decisions.md](docs/decisions.md#verzování) for the rules.

## V3.1.5 – November 2026
- 25 new series: James Bond, Mission: Impossible, John Wick, Indiana Jones, The Matrix, Terminator, Rocky & Creed, Back to the Future, Die Hard, The Hunger Games, Twilight, Planet of the Apes, Transformers, Star Trek, Bourne, Men in Black, Ghostbusters, Predator, Rambo, The Godfather, Knives Out, Paddington, Kingsman, Jumanji and The Karate Kid
- New genre: Drama

## V3.1.4 – November 2026
- Eight themed genre picks: Time Travel, Space Adventures, Cyberpunk & Dystopia, Heist Movies, Martial Arts, 80s Action, War Movies and Christmas Movies
- New genres: Family and War
- Better collection covers – Marvel shows Endgame, Lucasfilm Star Wars, Bruckheimer Armageddon and so on

## V3.1.3 – November 2026
- Ten new studios: Marvel (every Marvel movie, not just the MCU), DC, Warner Bros., Lucasfilm, Jerry Bruckheimer Films (Armageddon, Top Gun, Bad Boys…), Illumination, Sony Pictures Animation, Blue Sky, Laika and Aardman – each browsable by series
- Wider layout on large screens; genre filters wrap instead of hiding off-screen

## V3.1.2 – November 2026
- Two-level filter on the overview: first the collection type (series, studios, genre picks, paths), then the genre
- New genres: Sci-fi and Fantasy are now separate, plus Comedy and Crime & Thriller

## V3.1.1 – November 2026
- 29 movies added to existing collections: the full Batman history (Burton, Schumacher, Joker…), classic animated Middle-earth films, Star Wars TV films, more Disney remakes
- Upcoming movies like Avengers: Secret Wars, Shrek 5 and Frozen III are ready and will appear once they're out
- Batman and Middle-earth can now be browsed by series

## V3.0.2 – November 2026
- Pixar, DreamWorks, Disney, X-Men, Spider-Man, Alien, Asterix and The Conjuring can be browsed by series
- Labels like "Spin-off", "Prequel" or "Live-action remake" next to movie titles
- The Shrek collection is now part of DreamWorks (your viewings stay)
- Paths rewritten in a truly recommended order – story order, hero by hero, or from easy to intense

## V3.0.1 – November 2026
- Collections can be viewed three ways: by release, in story order, or by series (Iron Man, Thor, Captain America…)
- Movie labels like "Episode IV – A New Hope" next to the title
- Search finds series inside collections too, e.g. "Iron Man" in the Marvel Cinematic Universe
- Paths moved to the end of the overview

## V2.7 – November 2026
- Faster start: a lighter sign-in library, smaller JavaScript and CSS, and text that shows right away
- First content appears about 30 % sooner on a slow phone connection

## V2.6 – November 2026
- Bot protection (Cloudflare Turnstile) on sign-up, sign-in and password forms – usually invisible
- Forgot password fills in the email you typed on the sign-in page
- The new-password screen shows which account you're changing the password for

## V2.5 – November 2026
- Forgot password? – get a link by email and choose a new password
- Change password on your profile (Google accounts can set one too)
- Stronger passwords: at least 8 characters with a letter and a number

## V2.4 – November 2026
- Emails now come from My Movie Diary with a new design (confirm email, reset password, change email)
- After confirming your email you're signed in right away – or taken to sign in if you opened the link elsewhere
- "Please confirm your email first" instead of a generic error, plus a Resend confirmation email button
- Clear message when a link has expired or was already used

## V2.3 – November 2026
- Nicknames are checked against community rules – also with numbers and symbols instead of letters
- Delete your account and all your data from your profile page
- Admin: blocked words list, "nickname breaks the rules" flag and Reset nickname

## V2.2 – November 2026
- About page with community rules and contact
- New footer: About · Terms · Privacy · Contact · GitHub
- Terms of Service with community rules; updated, more detailed Privacy Policy
- Registration asks you to confirm you are at least 15 and agree to the Terms and Privacy Policy

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
