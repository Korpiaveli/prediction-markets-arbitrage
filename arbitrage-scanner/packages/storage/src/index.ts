export { JsonStorage, type JsonStorageConfig } from './json/JsonStorage.js';

// Factory function
import { JsonStorage, JsonStorageConfig } from './json/JsonStorage.js';

export function createJsonStorage(config: JsonStorageConfig): JsonStorage {
  return new JsonStorage(config);
}