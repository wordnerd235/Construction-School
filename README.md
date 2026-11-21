# Construction School 🚧

A rock-grinding simulator for kids. You run an excavator arm that picks up rocks and drops them into a jaw crusher. A conveyor carries the gravel to a ball mill, which grinds it into dust. Each job you finish earns a badge.

## Play
Open `index.html` in a browser, or visit the GitHub Pages site. Works on iPad (best held sideways), phones, and desktop.

- **Drag** on the screen to move the arm (or switch to **Levers** mode)
- **GRAB / DROP** picks up and lets go of a rock
- **START / STOP** runs the machines
- 🚚 calls the dump truck
- On a keyboard: arrow keys move the arm, Space grabs, Enter starts

## Host on GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo → **Settings → Pages** → Source: **GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes every push to `main`.
3. The site appears at `https://<username>.github.io/<repo>/` within a minute or two.

No build step. It's plain HTML, CSS, and JavaScript.
