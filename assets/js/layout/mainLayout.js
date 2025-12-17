import { FOOTER_DISABLED_PAGES, shouldRenderFooter } from '../config/layout.js';
import { LOGO_TEXT, NAV_LABS, NAV_SECTIONS } from '../config/navigation.js';
import { FOOTER_PRESETS } from '../config/footerPresets.js';
import { setupNav } from '../nav.js';
import {
  initSiteShell,
  renderSiteFooter,
  renderSiteHeader
} from './siteShell.js';

export {
  FOOTER_DISABLED_PAGES,
  FOOTER_PRESETS,
  LOGO_TEXT,
  NAV_LABS,
  NAV_SECTIONS,
  initSiteShell,
  initSiteShell as initMainLayout,
  renderSiteFooter,
  renderSiteHeader,
  setupNav,
  shouldRenderFooter
};
