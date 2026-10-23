"""Build the lazily loaded country lookup from Natural Earth 5.1.2 (public domain).

Download geojson/ne_50m_admin_0_countries.geojson from
https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2
then run: python tools/photos/build_country_outlines.py INPUT.geojson
"""
import json
from pathlib import Path
import sys


def simplify(points, tolerance=.02):
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        start, end = pending.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        furthest, distance = start, tolerance * tolerance
        for index in range(start + 1, end):
            x, y = points[index]
            ratio = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / length)) if length else 0
            value = (x - ax - ratio * dx) ** 2 + (y - ay - ratio * dy) ** 2
            if value > distance:
                furthest, distance = index, value
        if furthest != start:
            keep.add(furthest)
            pending.extend([(start, furthest), (furthest, end)])
    result = [points[index] for index in sorted(keep)]
    return [[round(x, 4), round(y, 4)] for x, y in (result if len(result) >= 4 else points)]


def build(source):
    countries = []
    for feature in source['features']:
        geometry, props = feature['geometry'], feature['properties']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        countries.append({'code': props['ISO_A2_EH'], 'name': props['NAME_EN'],
                          'polygons': [[simplify(ring) for ring in polygon] for polygon in polygons]})
    return countries


if __name__ == '__main__':
    destination = Path(__file__).resolve().parents[2] / 'WebApp/src/data/photo-countries.json'
    destination.write_text(json.dumps(build(json.loads(Path(sys.argv[1]).read_text())), separators=(',', ':')) + '\n')
    print(f'{destination.name}: {destination.stat().st_size:,} bytes')
