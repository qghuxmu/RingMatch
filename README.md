# RingMatch

**Beyond Local Refinement: Wide-Area Precise Cross-View Localization**

[Project page and interactive demo](https://qghuxmu.github.io/RingMatch/)

RingMatch is a search-and-verification framework for wide-area cross-view localization. It combines multi-hypothesis branch-and-zoom search with depth-ring-grounded candidate verification.

The project website is in [`docs/`](docs/). The overview replays eight recorded same-area inference cases from four cities, using the experiment configuration (M=16, B=4). The replay preserves sampled coordinates, clusters, crop bounds, search path scores, depth-ring values, and LVLM decisions. Case data and compressed images load on demand. Verifier probabilities are shown only when present in the recording.

## Website

The website uses static HTML, CSS, and JavaScript, with no build step. GitHub Pages publishes the `docs/` directory on the `main` branch.

To update the website, edit files in `docs/` and push changes to `main`.
