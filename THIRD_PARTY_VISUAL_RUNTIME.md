# Packaged local visual runtime

PrivacyFill packages its OCR runtime and English recognition data into the built extension. Runtime
downloads and CDN fallbacks are blocked by the extension content security policy. The build verifies every
copied asset against `extension/vendor/tesseract-assets.json` before producing `dist/extension`.

## Components

| Component | Pinned version | License | Purpose |
| --- | --- | --- | --- |
| Tesseract.js | 7.0.0 | Apache-2.0 | Browser worker API and local OCR orchestration |
| tesseract.js-core | 7.0.0 | Apache-2.0 | LSTM-only WebAssembly OCR engine (baseline, SIMD and relaxed-SIMD variants) |
| @tesseract.js-data/eng | 1.0.0 | MIT | Packaged English `4.0.0_best_int` trained data |

The available upstream license texts and the English model package metadata declaring its MIT license are
copied into `dist/extension/vendor/tesseract/licenses` during every extension build.

## Privacy and execution policy

- OCR is opt-in from the Privacy Inspector and never runs automatically while idle.
- OCR accepts only bounded candidate crops selected by the local perception controller; the full screenshot
  is rejected as an OCR candidate.
- Raw OCR strings and crop images remain inside the inspector task and are discarded immediately after local
  taxonomy classification and minimization.
- Only anonymous region identifiers, fixed semantic categories, confidence buckets and timing/count metrics
  may leave the OCR module. No OCR text is placed in the inspector proof, planner request, audit log or server
  request.
- `cacheMethod: "none"` prevents language/model data from being written to IndexedDB.
- The extension CSP allows packaged WebAssembly but restricts network connections, scripts and workers to the
  extension itself plus local `data:`/`blob:` resources needed for image decoding.

## Updating assets

Update exact npm versions, recompute every SHA-256 and byte length, review upstream licenses, update the
manifest and run `npm run verify`. A mismatched or missing runtime/model file fails the build.
