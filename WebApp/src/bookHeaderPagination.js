export async function syncEpubPreviewPages(renditions, slots, isDisposed = () => false) {
  const firstLocation = await renditions[0].currentLocation();
  if (isDisposed()) return null;
  let location = firstLocation;

  for (let index = 1; index < renditions.length; index++) {
    slots[index].hidden = Boolean(location.atEnd);
    if (location.atEnd) continue;

    const rendition = renditions[index];
    // Use the end of the preceding page, away from its leading column boundary.
    // Only move this slot: restoring the preceding rendition from a CFI can
    // round back to an earlier page and undo the user's navigation.
    await rendition.display(location.end.cfi);
    if (isDisposed()) return null;
    await rendition.next();
    if (isDisposed()) return null;
    location = await rendition.currentLocation();
    if (isDisposed()) return null;
  }

  return { cfi: firstLocation.start.cfi, start: Boolean(firstLocation.atStart), end: Boolean(location.atEnd) };
}
