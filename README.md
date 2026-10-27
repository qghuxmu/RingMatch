# RingMatch

**Beyond Local Refinement: Wide-Area Precise Cross-View Localization**

[Project page and interactive demo](https://qghuxmu.github.io/RingMatch/)

RingMatch is a search-and-verification framework for wide-area cross-view localization. It combines multi-hypothesis branch-and-zoom search with depth-ring-grounded candidate verification.

The project website is in [`docs/`](docs/). The overview replays eight recorded same-area inference cases from four cities, using the experiment configuration (M=16, B=4). The replay preserves sampled coordinates, clusters, crop bounds, integer path-support totals, depth-ring values, ground-truth reference positions, and LVLM decisions. Case data and compressed images load on demand. Ring curves use circular smoothing for display; raw numerical arrays and verifier records remain unchanged. The Run button starts a replay at a fixed speed; the shortlist keeps the source search layout order and ranks. Display labels are A then B, colors follow each search branch, and rings and verifier decisions are mapped to the same physical candidates. Original A/B labels remain in the recorded case data. Verifier probabilities were not included in the collected run, so the replay shows the recorded selection.

## Website

The website uses static HTML, CSS, and JavaScript, with no build step. GitHub Pages publishes the `docs/` directory on the `main` branch.

To update the website, edit files in `docs/` and push changes to `main`.

The depth-map previews are offline, direct full-panorama predictions from Depth Anything V2 Metric Outdoor Large. They illustrate the depth stage and are distinct from the recorded rings and verifier inputs. Crop guides retain the source-mosaic boundary shifts from the recorded run; when a child extends beyond its parent view, the replay briefly reveals surrounding mosaic context and marks the original input window with a dashed outline.
