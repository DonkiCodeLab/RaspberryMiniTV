import test from "node:test";
import assert from "node:assert/strict";
import { movieFileQuality, formatFileSize, releaseSource } from "../src/movieFileQuality.js";

test("cropped theatrical releases retain the appropriate resolution tier", () => {
  assert.equal(movieFileQuality({ width: 1920, height: 800 }).resolution, "1080p Full HD");
  assert.equal(movieFileQuality({ width: 3840, height: 1600 }).level, 5);
});
test("a low quality capture is never rated spectacular by its resolution", () => {
  assert.equal(movieFileQuality({ width: 3840, height: 2160 }, "Film.2160p.HDCAM.mkv").level, 1);
  assert.equal(movieFileQuality({ width: 1920, height: 1080 }, "Film.DVDSCR.mkv").level, 2);
});
test("unknown resolution is never invented from a release name", () => {
  assert.equal(movieFileQuality({}, "Film.2160p.BluRay.mkv").level, 0);
  assert.equal(releaseSource("Film.1080p.WEB-DL.x265.mkv"), "WEB-DL");
  assert.equal(releaseSource("Film.1080p.BluRay.REMUX.mkv"), "Remux");
  assert.equal(releaseSource("Cats.mkv"), null);
});
test("size uses real bytes, with no fabricated demo or missing size", () => {
  assert.equal(formatFileSize(1.5 * 1024 ** 3, "en"), "1.5 GiB");
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(undefined), null);
});
