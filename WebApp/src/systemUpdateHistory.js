export function formatSystemUpdateDate(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = number => String(number).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function systemUpdateCommitUrl(repositoryUrl, hash) {
  if (typeof repositoryUrl !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repositoryUrl) ||
      [".", ".."].includes(repositoryUrl.split("/").at(-1)) || typeof hash !== "string" || !/^[a-f0-9]{7,64}$/i.test(hash)) return null;
  return `${repositoryUrl}/commit/${hash}`;
}
