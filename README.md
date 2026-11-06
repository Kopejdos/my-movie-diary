# 🎬 My Movie Diary

**My Movie Diary (MMD)** is a personal web app for tracking movies across film collections – MCU, X-Men, DC, Alien, Studio Ghibli, Pirates of the Caribbean, Asterix & Obelix and more.

Instead of a simple checkbox, every viewing is logged, so you can see how many times you have watched a movie, when you watched it last, and how far you are through each collection.

🌐 **Live:** https://kopejdos.github.io/my-movie-diary/

> **V2.7** – see [CHANGELOG.md](CHANGELOG.md) for what's new and [docs/decisions.md](docs/decisions.md) for the roadmap.

## Features

- 52 collections, 6 curated paths and 700+ movies from TMDB – MCU, Star Wars, Disney, Pixar, DreamWorks, Studio Ghibli, horror series and hand-picked horror genres, each with its own color and banner
- Categories (Superhero, Animation, Horror…) and collection types (series, studios, genre picks)
- +1 / −1 viewing counter – every viewing is logged with a date
- Progress per collection, **Up next** and **Continue watching** suggestions
- Release order or story (chronological) order, "unwatched only" filter
- Instant search across all movies and collections (by title, original title or year), plus people search
- Public profiles you can share with a link – opt-in, private by default
- Curated paths – step-by-step routes like MCU Essentials or Horror 101, with a note for every step
- Watchlist across all collections
- Achievements with levels (Bronze → Platinum) and completed-collection badges
- XP and levels with movie-themed titles – from Extra to Legend
- Personal stats – activity, most watched movies, decades, categories, streaks and collections you're closest to finishing
- Sign in with email or nickname & password, or with Google; password reset and bot protection (Cloudflare Turnstile)
- Light and dark mode
- Admin panel: collections, movies (search TMDB right from the app) and users
- Installable on a phone or computer (PWA), opens even offline

**Coming next** – collections & new features
- V3.0 – better organized collections: view by release, story or series (Toy Story, Cars… inside Pixar)
- V3.1 – new collections, then ratings, "What tonight?", Coming soon and comparing with friends

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
├── scripts/             helper scripts (movie import)
├── supabase/            database migrations and Edge Functions
└── web/                 the website itself (deployed to GitHub Pages)
```

## Documentation

- [Changelog](CHANGELOG.md)
- [Decisions and roadmap](docs/decisions.md)
- [Data model](docs/data-model.md)
- [Setup guide](docs/setup.md)
- [Privacy policy](https://kopejdos.github.io/my-movie-diary/privacy.html)
- [Terms of Service](https://kopejdos.github.io/my-movie-diary/terms.html)

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB logo" height="16"></a>

## License

[MIT](LICENSE) © Adam Kopecký
