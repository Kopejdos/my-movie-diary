# 🎬 My Movie Diary

**My Movie Diary (MMD)** is a personal web app for tracking movies across film collections – MCU, X-Men, DC, Alien, Studio Ghibli, Pirates of the Caribbean, Asterix & Obelix and more.

Instead of a simple checkbox, every viewing is logged, so you can see how many times you have watched a movie, when you watched it last, and how far you are through each collection.

🌐 **Live:** https://kopejdos.github.io/my-movie-diary/

> **V4.4.6** – see [CHANGELOG.md](CHANGELOG.md) for what's new and [docs/decisions.md](docs/decisions.md) for the roadmap.

## Features

- 420 collections, curated paths and about 4,000 movies from TMDB – MCU, Star Wars, James Bond, Mission: Impossible, Marvel, DC, Warner Bros., Lucasfilm, Disney, Pixar, DreamWorks, Illumination, Studio Ghibli, horror series, hand-picked horror genres and themed picks (Time Travel, Heist, Christmas…), each with its own color and banner
- Two-level filter: collection type (series, studios, genre picks, paths), then genre (Superhero, Sci-fi, Fantasy, Animation, Horror…); collections sorted A–Z, by recently added or by your progress; view a collection by release, in story order or by series
- +1 / −1 viewing counter – every viewing is logged with a date; movies you saw long ago can be marked *Seen before* (one by one or a whole collection)
- Your own lists – any movies from My Movie Diary, in your order; private, for friends or public – trending public ones show up in **Community** and in search; follow the ones you like
- Progress per collection and **Up next** in every collection
- **What to watch today?** – three daily picks (watchlist, what's next, something new based on your favourite genres) with Shuffle
- **Coming soon** – announced movies up to five years ahead: a release calendar of all collections (by quarter) with search and filters (collection type, genre, your watchlist) and a section at the bottom of each collection; movies switch to regular ones on their release day
- Ratings from ½ to 5 stars, with the average of all My Movie Diary users
- Release order or story (chronological) order, "unwatched only" filter
- Movie details – tap a poster or title for a bigger poster, the story in your language, the collections it's in and a YouTube trailer
- Instant search across all movies, collections and series inside them (by title, original title or year), plus people search
- Public profiles you can share with a link – opt-in, private by default
- Friends – mutual friend requests by nickname; friends can see each other's profile even when it's private
- Compare with a friend – movies in common, taste match from your ratings, recommendations and collections side by side
- Movie requests – ask for missing movies (up to 30 at once), a whole series or your own collection from any movies (with order, sections and labels), +1 what others want, follow the status of your requests (with the reason when one is rejected – edit a collection request and send it again), a warning when a similar collection already exists
- Curated paths – step-by-step routes like MCU Essentials or Horror 101, with a note for every step
- Director collections – Nolan, Tarantino, Kubrick, Hitchcock, Scorsese, Bergman, Fellini and over 80 more, decade by decade
- Watchlist across all collections
- Achievements with levels (Bronze → Platinum) and completed-collection badges – Pathfinder for paths, Auteur for directors
- XP and levels with movie-themed titles – from Extra to Legend; higher levels raise your limits (requests, lists)
- Elite ★ badge for special members, given by the admin
- Personal stats – activity, most watched movies, decades, categories, streaks and collections you're closest to finishing
- Sign in with email or nickname & password, or with Google; password reset and bot protection (Cloudflare Turnstile)
- Settings ⚙ – System / Light / Dark mode, Modern or Paper classic style, collection colors or one fixed color, compact density and reduced animations; your defaults and account in one place
- Admin panel: collections, movies (search TMDB right from the app), users and requests – an editor that saves every change of a collection with one Save, a new collection from a TMDB series or a request in one click; changes are written back into the seed automatically; new parts of TMDB series are spotted for you
- An admin team – the owner grants the admin role, every change in the admin panel goes into an activity log, and an [admin guide](docs/admin-guide.md) explains every tab
- Collection builder for admins: a person's filmography, two people together (Bud Spencer & Terence Hill), a studio or a TMDB keyword → tick the movies → a new collection; a progress bar towards the next catalog goal
- Five languages – English, Čeština, Deutsch, Español, Українська (follows your browser, or pick one in Settings), including translated movie titles from TMDB and translated collections (admins can check them against TMDB and fix them in the app)
- A short tour for newcomers and a Help page – what every button does and the rules
- Phone-friendly: a compact layout with a bottom bar
- Installable on a phone or computer (PWA), opens even offline

**Coming next** – new features
- V4 – a yearly Wrapped and speed-ups for the bigger catalog (over 2,400 movies now); V5 – TV shows

## Tech stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript (ES modules, no build step), self-hosted fonts and a slimmed-down supabase-js bundle; JS and CSS are minified on deploy |
| Hosting | GitHub Pages (deployed by GitHub Actions) |
| Database & auth | [Supabase](https://supabase.com) (PostgreSQL, Row Level Security) |
| Movie data | [TMDB API](https://www.themoviedb.org) via a Supabase Edge Function |

## Repository structure

```
my-movie-diary/
├── .github/workflows/   GitHub Actions (Pages deployment, keep-alive)
├── docs/                project documentation
├── scripts/             helper scripts (movie import, seed sync, title translations, collection packs)
├── supabase/            database migrations, Edge Functions, the seed and collection packs (`supabase/packs/`)
├── tests/               automated tests of the app logic (`node --test`)
└── web/                 the website itself (deployed to GitHub Pages)
```

## Documentation

- [Changelog](CHANGELOG.md)
- [Decisions and roadmap](docs/decisions.md)
- [Data model](docs/data-model.md)
- [Setup guide](docs/setup.md)
- [Admin guide](docs/admin-guide.md) (in Czech)
- [Privacy policy](https://kopejdos.github.io/my-movie-diary/privacy.html)
- [Terms of Service](https://kopejdos.github.io/my-movie-diary/terms.html)

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.

The settings and bottom-bar icons are based on [Feather Icons](https://feathericons.com) (MIT).

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB logo" height="16"></a>

## License

[MIT](LICENSE) © Adam Kopecký
