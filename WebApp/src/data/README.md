`photo-countries.json` contains simplified country outlines used only to frame
the photo minimap. It is loaded with that map, never with the initial gallery.
Country lookup runs locally; it does not call a reverse-geocoding service.

Source: [Natural Earth Admin 0 Countries, 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/),
[release v5.1.2 GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson).
Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
Source SHA-256: `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`.

Rebuild with `python tools/photos/build_country_outlines.py SOURCE.geojson` from
the repository root. The script simplifies rings with a 0.02-degree tolerance
and rounds coordinates to four decimals. These are display bounds, not an
authoritative border lookup. Near-coast points can use the closest outline;
points without a country match fall back to a regional view centered on the photo.
Distant overseas territories are excluded from the local country's frame.
