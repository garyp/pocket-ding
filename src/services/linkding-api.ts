// Re-export everything from the interface and implementations
export type { LinkdingAPI } from './linkding-api-interface';
export { createLinkdingAPI } from './linkding-api-interface';
export { MockLinkdingAPI } from './linkding-api-mock';
export { RealLinkdingAPI } from './linkding-api-real';