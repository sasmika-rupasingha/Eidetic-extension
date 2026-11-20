/**
 * Which browser the extension runs in, for wording and for the few places Chrome and Firefox differ (Firefox doesn't
 * let extensions open its about: pages, such as about:addons, so we explain the way there instead).
 */
export const IS_FIREFOX = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
export const BROWSER_NAME = IS_FIREFOX ? 'Firefox' : 'Chrome';
