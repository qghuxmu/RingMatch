# RingMatch

**Beyond Local Refinement: Wide-Area Precise Cross-View Localization**

[Project page and interactive demo](https://qghuxmu.github.io/RingMatch/)

RingMatch is a search-and-verification framework for wide-area cross-view localization. It combines multi-hypothesis branch-and-zoom search with depth-ring-grounded candidate verification.

The project website is in [`docs/`](docs/). The overview includes eight recorded inference cases from four cities, using the experiment configuration (M=16, B=4). The explorer preserves sampled coordinates, clusters, crop bounds, integer path-support totals, depth-ring values, ground-truth reference positions, and LVLM decisions. Interactive case data and compressed images load on demand near the viewport. The video is a 60.47-second H.264 MP4 (1792×1040, 30 fps, approximately 7.3 MiB) with a fast-start index and a WebP poster. Ring curves use circular smoothing for display; raw numerical arrays and verifier records remain unchanged. The overview video replays case-01 at the existing fixed speed, with muted autoplay, seeking, playback speeds and fullscreen. The interactive explorer below defaults to case-02 and offers Search, Depth Rings, and Verification views. A stable, selectable search tree links recorded hypotheses to their actual input crops, sample memberships, support totals, and pruning decisions. Pruned branches remain inspectable without inventing further inference. Three separate rings support synchronized direction inspection and an optional local extraction animation. Verification links candidate evidence, recorded probabilities, and final map positions, with navigation back to each search origin. The selected view is preserved across case switches, while object selections reset. Video playback pauses when the explorer is used; the shortlist keeps the source search layout order and ranks. Display labels are A then B, colors follow each search branch, and rings and verifier decisions are mapped to the same physical candidates. Original A/B labels remain in the recorded case data. A supplementary verifier pass provides A/B choice probabilities from the original six-image inputs and checkpoint, normalized over the two answer tokens after the answer prefix. These scores follow the same display-label mapping; the original selected candidates remain unchanged.

## Website

The website uses static HTML, CSS, and JavaScript, with no build step. GitHub Pages publishes the `docs/` directory on the `main` branch.

To update the website, edit files in `docs/` and push changes to `main`.

The depth-map previews are offline, direct full-panorama predictions from Depth Anything V2 Metric Outdoor Large. They illustrate the depth stage and are distinct from the recorded rings and verifier inputs. Input crops retain the source-mosaic boundary shifts from the recorded run. A context map shows each selected crop in the original aerial region; crops are not constrained to the preceding crop boundary. Direction inspection uses the recorded, display-smoothed rings and does not imply numerical correspondence with the separate depth preview.

Method explanations highlight the corresponding figure region on hover. Qualitative examples crossfade after decoding, result values update without reordering rows, and motion respects reduced-motion preferences.
