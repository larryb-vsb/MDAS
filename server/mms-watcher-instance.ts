// Shared MMS Watcher instance for use across the application
import MMSWatcher from "./mms-watcher.js";
import { storage } from "./storage";

let mmsWatcherInstance: InstanceType<typeof MMSWatcher> | null = null;

export function getMmsWatcherInstance(): InstanceType<typeof MMSWatcher> | null {
  return mmsWatcherInstance;
}

export function createMmsWatcherInstance(): InstanceType<typeof MMSWatcher> {
  if (!mmsWatcherInstance) {
    mmsWatcherInstance = new MMSWatcher(storage);
  }
  return mmsWatcherInstance;
}

export function setMmsWatcherInstance(instance: InstanceType<typeof MMSWatcher>): void {
  mmsWatcherInstance = instance;
}