# 🎬 My Movie Diary

**My Movie Diary (MMD)** is a personal web app for tracking movies across film collections – MCU, X-Men, DC, Alien, Studio Ghibli, Pirates of the Caribbean, Asterix & Obelix and more.

Instead of a simple checkbox, every viewing is logged, so you can see how many times you have watched a movie, when you watched it last, and how far you are through each collection.

🌐 **Live:** https://kopejdos.github.io/my-movie-diary/

> **V1.1.1** – see [CHANGELOG.md](CHANGELOG.md) for what's new and [docs/decisions.md](docs/decisions.md) for the roadmap.

## Features

- 22 collections and 350+ movies from TMDB – MCU, Star Wars, Disney, Pixar, DreamWorks, Studio Ghibli and more, each with its own color and banner
- +1 / −1 viewing counter – every viewing is logged with a date
- Progress per collection, **Up next** and **Continue watching** suggestions
- Release order or story (chronological) order, "unwatched only" filter
- Watchlist across all collections
- Sign in with email or nickname & password, or with Google
- Light and dark mode
- Admin panel: collections, movies (search TMDB right from the app) and users
- Installable on a phone or computer (PWA), opens even offline

**Coming next**
- V1.2 – categories and horror collections (wave 1)
- V1.3 – achievements
- V1.4 – horror wave 2
- V1.5 – search
- V1.6 – horror wave 3
- V1.7 – profile statistics
- V1.8 – shareable profiles

## Tech stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript (ES modules, no build step) |
| Hosting | GitHub Pages (deployed by GitHub Actions) |
| Database & auth | [Supabase](https://supabase.com) (PostgreSQL, Row Level Security) |
| Movie data | [TMDB API](https://www.themoviedb.org) via a Supabase Edge Function |

## Repository structure

```
my-movie-diary/
├── .github/workflows/   GitHub Actions (Pages deployment, keep-alive)
├── docs/                project documentation
├── supabase/            database migrations and Edge Functions
└── web/                 the website itself (deployed to GitHub Pages)
```

## Documentation

- [Changelog](CHANGELOG.md)
- [Decisions and roadmap](docs/decisions.md)
- [Data model](docs/data-model.md)
- [Setup guide](docs/setup.md)
- [Privacy policy](https://kopejdos.github.io/my-movie-diary/privacy.html)

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB logo" height="16"></a>

## License

[MIT](LICENSE) © Adam Kopecký
