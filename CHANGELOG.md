# Changelog

All notable changes to My Movie Diary. Versions follow **V<major>.<minor>.<patch>** –
see [docs/decisions.md](docs/decisions.md#verzování) for the rules.

## V3.5.2.2 – November 2026
- Collections are sorted A–Z by default ("The" is skipped) – or by recently added or your progress
- The overview is shorter: each group shows two rows, the rest is one click away (Show all)
- Admin: a search bar in every tab – collections (even by a movie inside them), users, nicknames and requests

## V3.5.2.1 – November 2026
- Admin: every change made in the admin panel (adding, editing, moving or removing movies, editing, adding or deleting collections) is written into the seed automatically
- New movies are placed by release date instead of at the end of a collection
- Creating a collection from a series can add its movies to the studio collection too (e.g. Lethal Weapon → Warner Bros.)
- Fixed: unreleased movies added in the admin panel now show up in Coming soon

## V3.5.2 – November 2026
- **Collection requests** – Requests now has two modes: *Movies* (any movies, as before) and *Collection*: pick a movie, its whole series loads from TMDB and you choose which parts to ask for
- A collection request can only contain movies from one series – try to sneak in anything else and you get a friendly "Nuh uh"
- My requests show which collection you asked for
- Admin: create an official collection from a series in one click – from a collection request, or from suggestions when people request several movies of the same series
- Movies approved from requests are kept in their collections and written into the seed automatically – no more copying lines

## V3.5.1 – November 2026
- New series: RoboCop, Black Christmas, Terrifier, Happy Death Day and Ti West's X Trilogy (seed update)
- **Movie requests** – missing a movie? Search TMDB and ask for up to 20 movies at once; follow your requests (pending, added, rejected)
- See what others want and give +1 instead of asking twice
- Movies outside collections can be found in Search and logged like any other ("Other movie")
- New series: The Texas Chainsaw Massacre and Wrong Turn

## V3.4.2 – November 2026
- **Compare with a friend** – movies you've both seen, what only one of you has watched and how much your lists overlap
- Taste match: how similar your ratings are, movies you both loved and your biggest disagreements (friends only)
- Your friend's recommendations and your collections side by side

## V3.4.1 – November 2026
- **Friends** – add friends by nickname, accept or decline requests, see all your friends in the new Friends tab
- No public profile needed: friends can see each other's profile even when it's private
- A badge in the header shows new friend requests

## V3.3.2 – November 2026
- Fixed: movies that TMDB marks as released ahead of their premiere (like The Hunger Games: Sunrise on the Reaping) now show up in Coming soon until their release day

## V3.3.1 – November 2026
- New **Coming soon** page in the menu – every announced movie from all collections, soonest first, split by quarter
- Upcoming movies switch to regular ones automatically on their release day – no waiting for an update
- The five-year window moves on its own every New Year
- New in Heist Movies: How to Rob a Bank

## V3.3 – November 2026
- **What to watch today?** – three picks at the top of the overview: one from your watchlist, what's next in a collection you've started, and something new based on the genres you watch most. Shuffle for different picks
- **Coming soon** – announced movies (Avatar 4 & 5, Incredibles 3, Shrek 5, Avengers: Secret Wars…) at the bottom of their collections with release dates; they don't count towards progress until they're out
- Add upcoming movies to your watchlist
- Fixed: the overview could scroll sideways on phones

## V3.2 – November 2026
- Rate movies from ½ to 5 stars – on every movie you've seen
- See the average rating of My Movie Diary users next to each movie
- Stats: your average rating, top rated movies and how you rate

## V3.1.5 – November 2026
- 25 new series: James Bond, Mission: Impossible, John Wick, Indiana Jones, The Matrix, Terminator, Rocky & Creed, Back to the Future, Die Hard, The Hunger Games, Twilight, Planet of the Apes, Transformers, Star Trek, Bourne, Men in Black, Ghostbusters, Predator, Rambo, The Godfather, Knives Out, Paddington, Kingsman, Jumanji and The Karate Kid
- New genre: Drama
- New versions now show up right after an update – no more reloading twice

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
