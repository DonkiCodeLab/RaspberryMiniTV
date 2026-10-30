/** Keep the original filename when expo/fetch serializes a filesystem File.
 * Expo's FormData only applies append's third argument to instanceof Blob;
 * expo-file-system File implements Blob without extending it. Its default name
 * is the staging basename (pending-UUID), which has no image extension.
 * Override the JS name getter, leaving the persisted URI and bytes untouched so
 * uploads saved by older versions can resume with the same digest and receipt.
 */
export function withUploadName<T extends Blob>(file: T, name: string): T {
  const safeName = name.replace(/[\r\n"\\/]/g, '_');
  return Object.defineProperty(file, 'name', { value: safeName, configurable: true });
}
