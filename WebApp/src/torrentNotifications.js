// Restarting a torrent archives its previous job under a new history id. Keep
// that alert attached to the original run, never to the new download.
export function torrentNotificationKey(job) {
  return JSON.stringify([job.id.replace(/-history-\d+$/, ""), job.createdAt ?? null]);
}

export function wantsTorrentNotification(job, preferences = {}) {
  return preferences[torrentNotificationKey(job)] === true;
}

export function completedTorrentNotifications(jobs = [], preferences = {}) {
  return jobs.filter(job => job.state === "complete" && wantsTorrentNotification(job, preferences));
}

export function torrentNotificationLabel(count, strings) {
  return (count === 1 ? strings.notificationOne : strings.notificationMany).replace("{count}", String(count));
}
