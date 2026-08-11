/**
 * Directive descriptions, phrased from the source's point of view.
 *
 * Carried across from the PaaS `CSP/PermissionModal.jsx` — these are the wording
 * that makes the domain-based model approachable. "Can use javascript from this
 * source" tells a marketer what ticking `script-src` actually does; the directive
 * name alone does not.
 *
 * **Display order is deliberate and differs from `ALL_DIRECTIVES`.** That
 * constant is the *emission* order the engine normalises against and must not be
 * reordered. This list groups directives the way an editor thinks about them —
 * page-level first, then framing, then fetch types, then the script and style
 * families together — matching the existing UI.
 */

import { Directives } from '../../shared/constants.js';

export interface DirectiveDescription {
  readonly directive: string;
  readonly description: string;
}

export const DIRECTIVE_DESCRIPTIONS: readonly DirectiveDescription[] = [
  {
    directive: Directives.BaseUri,
    description: 'Allows this source to be used within the base element for this site.'
  },
  {
    directive: Directives.DefaultSource,
    description:
      'Allows this source by default unless one or more sources are defined for a specific permission.'
  },
  {
    directive: Directives.ChildSource,
    description: 'Can contain this source in an iframe or use web workers it provides.'
  },
  {
    directive: Directives.FrameSource,
    description: 'Can contain this source in an iframe on this site.'
  },
  {
    directive: Directives.FrameAncestors,
    description: 'This source can contain this site in an iframe.'
  },
  {
    directive: Directives.ConnectSource,
    description: 'Allows links and data requests to this source.'
  },
  {
    directive: Directives.FormAction,
    description: 'Can use this source within a form action.'
  },
  {
    directive: Directives.FontSource,
    description: 'Can use fonts from this source.'
  },
  {
    directive: Directives.ImageSource,
    description: 'Can use images from this source.'
  },
  {
    directive: Directives.MediaSource,
    description: 'Can use audio and video files from this source.'
  },
  {
    directive: Directives.ObjectSource,
    description:
      'Allows content from this source to be used in applet, embed and object elements.'
  },
  {
    directive: Directives.ManifestSource,
    description: 'Allows this source to be provide a manifest for this site.'
  },
  {
    directive: Directives.ScriptSource,
    description: 'Can use javascript from this source.'
  },
  {
    directive: Directives.ScriptSourceElement,
    description: 'Can use javascript from this source to be used within a script tag.'
  },
  {
    directive: Directives.ScriptSourceAttribute,
    description:
      'Can use javascript from this source to be used within inline javascript events.'
  },
  {
    directive: Directives.WorkerSource,
    description: 'Can use Worker, SharedWorker and ServiceWorker scripts from this source.'
  },
  {
    directive: Directives.StyleSource,
    description: 'Can use styles from this source.'
  },
  {
    directive: Directives.StyleSourceElement,
    description: 'Can use styles from this source within a style tag.'
  },
  {
    directive: Directives.StyleSourceAttribute,
    description: 'Can use styles from this source within inline elements.'
  }
];
