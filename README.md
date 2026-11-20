# Lusaka Minibus Guide

A small, mobile-friendly guide to **sample** Lusaka minibus routes, stops, and approximate fares in Zambian kwacha (ZMW). It is a static site: plain HTML, CSS, and JavaScript, with no build step, so it can be hosted on GitHub Pages.

**Sample / approximate data.** The routes and fares in [`data/routes.json`](data/routes.json) are examples for this student project. They are not an official route list and they are not a fare survey. Minibus fares in Lusaka change. Confirm the destination and the fare with the conductor before you board. The same warning is shown in the app.

Built by **Wankumbu Musunga**, a 2nd-year distance BSc Computer Science student in Lusaka, Zambia, as a portfolio piece while looking for entry-level IT work.

## The problem it solves

Working out a minibus trip in Lusaka often means asking around: which bus passes both places, where you change, and what the fare might be. Answers differ, and a long page full of maps is expensive on a small data bundle.

This guide keeps that lookup on the phone:

- Type where you are and where you are going.
- See a direct minibus when the sample data has one.
- See a one-change trip when it does not, including where to change and the two fares added together.
- Read the whole sample list when you just want to browse.
- Open it again with no connection after the first visit.

## Features

- Search **from** and **to** stops by name or a common alias (Town / City Market, Kulima Tower, Intercity, Matero, Chilenje, Kalingalinga, UNZA, Chelston, Kabwata, Woodlands, Mtendere, Soweto Market, Manda Hill, East Park, and a few nearby places).
- Direct routes and trips with **one change**.
- Approximate fare in **ZMW** for each boarding. One-change trips show the two fares and the total.
- A list of every sample route, with a filter, plus the stops grouped by area.
- Offline use through a small service worker.
- Low data use: no framework, no web fonts, and no photo assets. One HTML file, one CSS file, one JavaScript file, and one JSON file. Those page files, plus the icon, are about 50 KB together.

## Run it locally

Service workers and `fetch` need a local web server. Opening `index.html` as a file will not load the routes.

From the project folder:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Check the search logic (no packages to install):

```bash
node --test tests/search.test.js
```

The test checks the sample file, name matching, direct fares, one-change fare totals, and that every stop can still reach every other stop within one change.

## Enable GitHub Pages

The site is already laid out for Pages. Files live at the repository root, and links are relative, so a project site in a subpath still works.

1. Push the `main` branch to GitHub.
2. Open the repository **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**, then save.
5. After the deployment finishes, the guide is at `https://<github-username>.github.io/lusaka-bus-route-guide/`.

The first online visit saves the page for offline use. Fare edits in `data/routes.json` are loaded from the network when the phone is online, then stored for the next offline visit.

## How to update route data

All editable data is in [`data/routes.json`](data/routes.json). The page does not hard-code routes.

1. Open `data/routes.json`.
2. To add a place, copy a stop and change `id`, `name`, `short`, `area`, and `aliases`. Use a lowercase `id` with hyphens, such as `garden-compound`. Set `"featured": true` if it should appear in the empty search suggestions.
3. To add a route, copy a route object:

```json
{
  "id": "town-garden",
  "name": "Town – Garden",
  "fareZmw": 12,
  "via": "Sample path, describe it in a few words",
  "stops": ["town", "garden-compound"]
}
```

4. `fareZmw` is the approximate **flat fare for one boarding**, in kwacha. Put the newest figure you have actually checked, and say in the pull request when and where you checked it.
5. List `stops` in one travel order. The app also searches that list in reverse, so you do not add a second copy for the return.
6. A one-change fare is calculated. Do not store it. The passenger pays `fareZmw` on the first bus plus `fareZmw` on the second.
7. Every stop should share a route with the rest of the network so a trip needs at most one change. The test fails if a new stop is stranded.
8. Update `about.sampleCompiled` to the day you checked the figures. Leave `about.disclaimer` in place so the page keeps labelling the file as a sample.
9. Run `node --test tests/search.test.js`.
10. If a phone keeps an old copy of the HTML, CSS, or JavaScript, change `CACHE_NAME` in [`sw.js`](sw.js) to a new name, such as `lusaka-minibus-v2`.

Please keep calling unpublished figures approximate. A wrong fare on a confident screen is worse than a clearly marked sample.

## Project structure

```
index.html              Page structure
styles.css              Layout, for a phone first
app.js                  Stop matching, trip search, and the page
sw.js                   Offline cache
manifest.webmanifest    Home-screen name and colours
icon.svg                Small icon
data/routes.json        Stops, sample routes, and sample fares
tests/search.test.js    Checks the search without a browser
LICENSE                 MIT
```

`app.js` keeps the search in plain functions (`resolveStop`, `findTrips`, `validateData`). The browser code is only the bottom half, inside `startApp`. That split is what the Node tests call, and it is the part a later SMS or USSD version could reuse.

## What I learned

I learned to treat the minibus network as data instead of burying place names in the page. Once stops and routes were JSON, adding a fare or a stop stayed a small edit, and the same file could drive search, the full list, and the tests.

I learned to search a network without a library: a direct trip is two stops on one route, in either direction, and a one-change trip is two routes that share a stop. Writing that as functions made the fare rule obvious. You add the two flat fares because the passenger pays again at the change.

I learned to keep a page light on purpose. No framework and no downloaded fonts means the guide is a few small files, which matters on a phone in Lusaka. Relative links mean the same folder works on my laptop and on GitHub Pages.

I learned how a service worker saves those files after one visit, and why the route file should prefer the network so a fare correction is not stuck behind an old cache.

I also learned to label uncertain real-world numbers. I can show a useful sample and still tell the reader to verify it. That seemed more honest than presenting a guess as today’s fare.

## Future ideas

- A **USSD or SMS** version for feature phones. Someone could text `TOWN CHELSTON` and get the same sample answer the web search already calculates.
- Languages used in Lusaka, including chiNyanja and chiBemba, for stop names and the instructions.
- A way for riders to suggest a fare correction, with the date and the place they boarded, reviewed before it changes `routes.json`.
- Stage fares, for routes that charge less for a short hop than for the full ride.
- A short walking note at busy change points such as Town, Kulima Tower, and Manda Hill.
- A simple drawn map only if it stays small. A heavy online map would fight the low-data goal.

## License

[MIT](LICENSE) © 2026 Wankumbu Musunga
