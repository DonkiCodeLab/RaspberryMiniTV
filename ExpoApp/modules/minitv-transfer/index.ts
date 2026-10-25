import { requireOptionalNativeModule } from 'expo-modules-core';

export type TransferState = {
  connected: boolean; server: string; running: boolean; preparing: boolean; limited: boolean;
  hasJob: boolean; canResume: boolean; message: string; error: string;
  total: number; imported: number; existing: number; failed: number; percentage: number;
  fileName: string; fileProgress: number; recent: string[]; backgroundNotice: string;
};
export interface TransferModule {
  getState(): Promise<TransferState>;
  previewPairing(qr: string): Promise<string>;
  connect(qr: string): Promise<void>;
  prepare(): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  report(): Promise<string>;
}
export default requireOptionalNativeModule<TransferModule>('MiniTVTransfer');
