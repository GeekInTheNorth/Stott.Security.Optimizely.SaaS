/**
 * Shared console primitives, built on Optimizely Axiom (`@optiaxiom/react`).
 *
 * Axiom is the documented design system for CMS UI extensions and is what
 * Optimizely's own reference app uses, so the console inherits CMS-native
 * styling, focus and disabled states, and accessible components rather than
 * reimplementing them.
 *
 * Everything visual goes through Axiom components and tokens. Inline styles are
 * reserved for the handful of one-off dimensions with no token, because they
 * cannot express `:hover`, `:focus-visible` or `:disabled` at all — a disabled
 * button styled inline is indistinguishable from an enabled one.
 */

import {
  Banner,
  Box,
  Group,
  Heading,
  SegmentedControl,
  SegmentedControlItem,
  Text
} from '@optiaxiom/react';

/**
 * Read-only rendering of what a response will actually carry.
 *
 * Monospace and selectable — copying a header value out of here is a legitimate
 * thing for an editor to want.
 */
export function Preview({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Box
      bg="bg.secondary"
      border="1"
      fontFamily="mono"
      p="8"
      rounded="sm"
      style={{ wordBreak: 'break-all' }}
    >
      {children}
    </Box>
  );
}

export function Section({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Group flexDirection="column" asChild gap="12">
      <section>
        <Box>
          <Heading level="3">{title}</Heading>
          {description && (
            <Text color="fg.tertiary" mt="4">
              {description}
            </Text>
          )}
        </Box>
        {children}
      </section>
    </Group>
  );
}

/**
 * Inline guidance or warning. `intent` maps straight onto Axiom's Banner.
 *
 * The body is wrapped in a single `Text` deliberately. `Banner` renders its
 * children into a `Group` whose recipe is `flexDirection: column`, so every
 * element among them becomes its own flex item on its own line: a sentence
 * containing a `<code>` fragment would break into four. The wrapper restores
 * normal inline flow.
 *
 * `title` is therefore the only way to get a second line, which is the right
 * constraint — a notice should be a heading and a paragraph, not an arbitrary
 * stack.
 */
export function Notice({
  intent,
  title,
  children
}: {
  intent: 'danger' | 'information' | 'neutral' | 'success' | 'warning';
  title?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Banner intent={intent}>
      {title && <Text fontWeight="600">{title}</Text>}
      <Text>{children}</Text>
    </Banner>
  );
}

export function SubNav<T extends string>({
  tabs,
  current,
  onSelect
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  current: T;
  onSelect: (id: T) => void;
}): React.JSX.Element {
  return (
    <SegmentedControl
      type="single"
      value={current}
      onValueChange={(value: string) => {
        // Radix clears the value when the active item is re-clicked; keep the
        // current tab rather than leaving the console with nothing selected.
        if (value) {
          onSelect(value as T);
        }
      }}
    >
      {tabs.map((tab) => (
        <SegmentedControlItem key={tab.id} value={tab.id}>
          {tab.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}
