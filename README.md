# Pokémon Tracker

Your own Gen I–IV Pokémon reference. Everything you enter is saved as plain files in the `data` folder.

```
 Your computer                            Free host (optional)
 ┌───────────────────────────┐            ┌────────────────────────┐
 │ start.bat                 │  git push  │ GitHub Pages           │
 │ Edit everything here      │ ─────────► │ Public, read-only copy │
 │ Saved to the data folder  │            │ No Edit buttons        │
 └───────────────────────────┘            └────────────────────────┘
```

## Run it on your computer

1. Install the LTS version of [Node.js](https://nodejs.org) if you don't have it. You only do this once.
2. Double-click `start.bat`.
3. Your browser opens at http://localhost:4173. Keep the black window open while you use the site. Close it to stop.

Opening `index.html` directly won't work. Always use `start.bat`.

## Back up your data, and use it on your laptop and PC

Put this folder in a Git repository. Your data is in `data`, so Git keeps its full history.

```
git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/pokemon-tracker.git
git push -u origin main
```

On the other computer, run `git clone https://github.com/YOUR-NAME/pokemon-tracker.git`.

Each time you switch computers, run `git pull` before you edit. When you're done, run:

```
git add .
git commit -m "Update data"
git push
```

## Put a read-only copy online for free

**GitHub Pages:** the repository has to be public on a free account.

1. On GitHub, open the repository's Settings, then Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Choose `main` and `/ (root)`, then Save.

Your site appears at `https://YOUR-NAME.github.io/pokemon-tracker/` within a few minutes. Every `git push` updates it.

**Private repository:** connect it to Cloudflare Pages or Netlify instead. Leave the build command empty and set the output folder to the top of the repository.

The online copy can't be edited. Make changes on your computer, then push them.

## Art

- Pokémon use PokéAPI sprites for the generation you're viewing: Red/Blue, Crystal, Emerald or Platinum.
- Each Pokémon's "PokéAPI sprite number" controls this. Blank uses its Dex number, up to 493. 0 turns PokéAPI art off. Any other number borrows that Pokémon's sprites.
- Sprites you upload go in `data/sprites` and replace PokéAPI art.
- Trainers use Pokémon Showdown art when a file matches their name. Otherwise, upload a picture.
- Each team in an encounter can have its own trainer picture. A team without one uses the trainer's picture.
- Sprites load from the internet. Without a connection, you'll see a letter instead.

## Files

| Path | What it holds |
| --- | --- |
| `data/*.json` | Your Pokémon, abilities, items, moves, TM lists, effects, trainers and type chart |
| `data/sprites` | Images you upload |
| `index.html`, `style.css`, `app.js` | The site |
| `server.js` | Runs the site on your computer and saves edits |
| `start.bat` | Starts it on Windows |
