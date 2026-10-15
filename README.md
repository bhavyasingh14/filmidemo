# Filmi Connections: deployment files

This is the latest text-only-card edition. Film posters and pencil sketches are decorative background elements. All artwork and fonts needed by the game are included.

## Deploy to GitHub Pages

1. Unzip the download.
2. Create a GitHub repository and upload the extracted contents. Keep `index.html` at the repository root, beside `app.js`, `core.js`, the CSS files, `puzzles.json`, and the `assets` folder. Do not upload only the ZIP file.
3. Open the repository's Settings, then Pages.
4. Under Build and deployment, choose Deploy from a branch. Select your branch (usually `main`) and `/(root)`, then Save.
5. Open the published address GitHub supplies after deployment completes.

Official instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Other static hosts

Upload this folder with `index.html` at its top level. No package installation, build command, database, or API key is needed. If your host asks for a publish directory, choose the folder containing `index.html`.

## Change the daily puzzle

Edit `puzzles.json`. Add another object to the `puzzles` array for each day, with its own unique `id`, display `number`, and `date` in `YYYY-MM-DD` format. Keep four groups, four cards in every group, and unique card titles within each puzzle. Each group needs a `name`, `id`, and `difficulty` from 1 to 4. Card titles are displayed as text; the optional poster metadata does not create images on the cards.

Difficulty colours are 1 yellow, 2 green, 3 blue, and 4 purple. Connections and colours are revealed only after a group is solved. Scheduled editions switch at midnight in India for every player. More dates can be added in advance. Updating the JSON file and publishing the change is enough; no scheduled server job is needed.

The supplied opening puzzle is dated 15 October 2026. Change that date if you want to use it on your own launch day. If there is no puzzle assigned to the current date, the game shows a coming-soon message; older supplied editions remain playable from the calendar icon. New puzzles must be supplied: the game does not generate them automatically.

The opening dataset uses Sulemani Keeda provisionally in place of Newton in the debut-directors group, as disclosed in the conversation. Saawariya uses the official spelling.

## Preview locally

Use any static HTTP server. For example, if Python is installed, run `python3 -m http.server 8000` in this folder, then open http://localhost:8000 . Opening `index.html` directly as a file may block JavaScript modules and the JSON loader.

## Progress and credits

Progress and statistics stay in the player's browser. A new deployment address has its own browser storage. Film artwork belongs to the respective rights holders; poster-wall source links and font license notices are included.
