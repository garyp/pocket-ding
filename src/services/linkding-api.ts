// Re-export everything from the interface and implementations
export type { LinkdingAPI, LinkdingAPIConstructor } from './linkding-api-interface';
export { createLinkdingAPI, testLinkdingConnection } from './linkding-api-interface';
export { MockLinkdingAPI } from './linkding-api-mock';
export { RealLinkdingAPI } from './linkding-api-real';