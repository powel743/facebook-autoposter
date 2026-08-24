# Poster images

Drop Fable-generated poster concepts here, one file per campaign day
(e.g. `day-11.png`), then reference the filename in the matching day's
entry in `../posts.json`:

```json
{
  "day": 11,
  "theme": "Product reveal",
  "content": "Introducing TenderIQ...",
  "image": "posters/day-11.png"
}
```

If a day has no `image` field, `poster.js` posts text-only to the Page feed.
If `image` is set, `poster.js` uploads that file as a photo post with the
`content` text as the caption. The path is checked for existence during
`npm run dry-run`, so you'll catch a missing file before a scheduled run
fails.

Supported formats: anything Facebook's Graph API accepts for `/photos`
(JPEG, PNG, GIF, BMP, TIFF). Keep files under Facebook's ~4MB Graph API
upload-by-form limit (larger images should be resized before committing).
