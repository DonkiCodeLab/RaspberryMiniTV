// Stop on the first failure; confirmed uploads are retained and never retried silently.
export async function uploadBookBatch({ files, uploadOne, onProgress, onReport, signal }) {
  const report = {
    startedAt: new Date().toISOString(), status: "uploading",
    files: files.map((file) => ({ name: file.webkitRelativePath || file.name, size: file.size, status: "pending" })),
  };
  const publish = () => onReport?.(JSON.parse(JSON.stringify(report)));
  const items = [];
  publish();
  for (let index = 0; index < files.length; index += 1) {
    const entry = report.files[index];
    try {
      if (signal?.aborted) throw Object.assign(new Error("Subida cancelada"), { name: "AbortError" });
      entry.status = "uploading";
      publish();
      const response = await uploadOne(files[index], (progress) => onProgress?.({
        ...progress, fileName: entry.name, current: index + 1, total: files.length,
        percent: Math.round((index + (progress.percent || 0) / 100) / files.length * 100),
      }));
      if (!response?.ok || (!response.mock && !response.items?.length)) throw new Error("El servidor no ha confirmado el archivo guardado.");
      items.push(...(response.items || []));
      entry.status = "saved";
      entry.relativePath = response.items?.[0]?.relativePath;
      publish();
    } catch (error) {
      entry.status = error.name === "AbortError" ? "canceled" : "error";
      entry.error = error.message;
      entry.httpStatus = error.status || null;
      report.status = entry.status;
      report.finishedAt = new Date().toISOString();
      report.error = `${entry.name}: ${error.message}`;
      report.note = "Si se perdió la conexión, comprueba la biblioteca antes de repetir el archivo: el servidor podría haberlo guardado sin confirmar la respuesta.";
      publish();
      error.report = report;
      error.items = items;
      throw error;
    }
  }
  report.status = "done";
  report.finishedAt = new Date().toISOString();
  publish();
  return { ok: true, items, report };
}
