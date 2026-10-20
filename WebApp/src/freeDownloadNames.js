export async function saveFreeDownloadNames(jobId, entries, changeContents) {
  const updated = [];
  let saved = 0, failed = 0, job;
  for (const entry of entries) {
    if (entry.name === entry.originalName) {
      updated.push({ ...entry, error: "" });
      continue;
    }
    try {
      const result = await changeContents(jobId, { action: "rename", path: entry.path, name: entry.name });
      updated.push({ ...entry, path: result.path, name: result.name, originalName: result.name, error: "" });
      job = result.job;
      saved++;
    } catch (error) {
      updated.push({ ...entry, error: error.message || String(error) });
      failed++;
    }
  }
  return { entries: updated, saved, failed, job };
}
