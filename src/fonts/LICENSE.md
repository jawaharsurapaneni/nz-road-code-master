# Embedded font

| File | Family | Licence | Source |
|---|---|---|---|
| `Inter-variable.woff2` | Inter, variable weight 400-600 | SIL OFL 1.1 | Google Fonts (Latin subset) |

Latin subset only, retrieved 2026-10-14. It is base64-embedded into the built HTML by
`tools/build.mjs`, so the application makes no network request for fonts and works
offline from `file://`. The SIL Open Font License 1.1 expressly permits embedding.

Inter - Copyright (c) 2016 The Inter Project Authors.
Full licence text: https://openfontlicense.org

## Why Inter

The app is a practice test, so it uses one plain sans-serif throughout rather than a
display face. Inter was drawn for screen interfaces and keeps `1` / `l` / `I` and
`0` / `O` visually distinct, which matters when a question turns on a figure such as
"100 metres" or on an option letter.

A system fallback stack (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `Arial`)
is declared after it, so the app degrades to a standard, familiar sans if the embedded
font ever fails to load.

## Previously embedded, now removed

Instrument Serif (regular and italic, SIL OFL) was embedded while the app used an
editorial display face for headings and question text. It was removed in favour of a
single sans at assessment-appropriate sizes; the two faces were 30 KB raw.
