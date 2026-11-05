# 🎬 My Movie Diary

**My Movie Diary (MMD)** is a personal web app for tracking movies across film universes – MCU, X-Men, DC, Alien, Studio Ghibli, Pirates of the Caribbean, Asterix & Obelix and more.

Instead of a simple checkbox, every viewing is logged, so you can see how many times you have watched a movie, when you watched it last, and how far you are through each universe.

🌐 **Live:** https://kopejdos.github.io/my-movie-diary/

> Status: in development – see [docs/decisions.md](docs/decisions.md) for the roadmap.

## Features

**Done**
- 17 universes and 200+ movies imported from TMDB
- Universes as cards with a progress bar
- Movies in each universe with poster, year and a +1 / −1 viewing counter
- Sign in with email or nickname & password, or with Google

**Planned**
- Redesign with universe colors, banners and light / dark mode
- Admin panel for universes, movies and users
- Release order or story (chronological) order, "Up next" suggestion
- Watchlist across all universes
- Installable on a phone (PWA)

**Later**
- Ratings and notes for each viewing, viewing history and statistics
- Custom universes
- Data export / import
- Sharing progress with friends

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

- [Decisions and roadmap](docs/decisions.md)
- [Data model](docs/data-model.md)
- [Setup guide](docs/setup.md)
- [Privacy policy](https://kopejdos.github.io/my-movie-diary/privacy.html)

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB logo" height="16"></a>

## License

[MIT](LICENSE) © Adam Kopecký
