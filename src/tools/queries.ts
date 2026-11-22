// Plain functions over the registry. No DOM and no rendering, so they run in
// Node and could be reused by an app with different views.

import { withBase } from '../site';
import type { Group, GroupId, HubSlug, PageWords, Tool, ToolPage, ToolWidgetWords } from './registry';

/** What a list of tools shows for one page. */
export type ListItem = {
  name: string;
  href: string;
  summary: string;
};

export type GroupWithItems = {
  id: GroupId;
  name: string;
  items: ListItem[];
};

export type PageWithTool = {
  tool: Tool;
  page: ToolPage;
};

/**
 * `base` is the site's base path: "/" at the root, or a sub-path for a preview.
 * It has no default, here or below, so that a caller cannot forget it.
 */
export function toListItem(page: ToolPage, base: string): ListItem {
  return { name: page.name, href: withBase(base, `/${page.slug}`), summary: page.summary };
}

/** Every published page, each with the tool that serves it. */
export function allPages(tools: Tool[]): PageWithTool[] {
  return tools.flatMap((tool) => tool.pages.map((page) => ({ tool, page })));
}

export function findPage(tools: Tool[], slug: string): PageWithTool | undefined {
  return allPages(tools).find(({ page }) => page.slug === slug);
}

/** The groups that have at least one published page, in registry order. */
export function groupsWithItems(groups: Group[], tools: Tool[], base: string): GroupWithItems[] {
  return groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      items: tools
        .filter((tool) => tool.group === group.id)
        .flatMap((tool) => tool.pages.map((page) => toListItem(page, base))),
    }))
    .filter((group) => group.items.length > 0);
}

/** A group's hub page: its words, its address and the list it shows. */
export type HubPage = GroupWithItems & {
  slug: HubSlug;
  /** The hub page's address under the base. */
  href: string;
  title: string;
  description: string;
  sentence: string;
};

/**
 * The hub pages to build: one for each group with a published page, in registry order. Built on
 * `groupsWithItems`, so the home page, the routes and the sitemap take which groups show from one rule.
 */
export function hubPages(groups: Group[], tools: Tool[], base: string): HubPage[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return groupsWithItems(groups, tools, base).map((shown) => {
    const group = byId.get(shown.id)!;
    return {
      ...shown,
      slug: group.slug,
      href: withBase(base, `/${group.slug}`),
      title: group.title,
      description: group.description,
      sentence: group.sentence,
    };
  });
}

/** The group a tool belongs to. Throws for a group that is not in the registry. */
export function groupOf(groups: Group[], tool: Tool): Group {
  const group = groups.find((each) => each.id === tool.group);
  if (!group) throw new Error(`Tool ${tool.id} names a group that is not in the registry.`);
  return group;
}

/** The link to a group's hub page, as a tool page shows it. */
export function hubLink(group: Group, base: string): { name: string; href: string } {
  return { name: group.name, href: withBase(base, `/${group.slug}`) };
}

/**
 * The related tools of a tool that are published, in the order the tool names them. A tool with
 * several pages may name its own other pages; `current`, the page being built, is never linked.
 */
export function relatedItems(tools: Tool[], tool: Tool, base: string, current: ToolPage): ListItem[] {
  const published = new Map(allPages(tools).map(({ page }) => [page.slug, page]));
  return tool.related.flatMap((slug) => {
    const page = published.get(slug);
    return page && slug !== current.slug ? [toListItem(page, base)] : [];
  });
}

/** The keys of the widget words a page may say differently from its tool's. */
export const pageWordKeys = ['actionLabel', 'resultNotes', 'outputExtension'] as const satisfies readonly (keyof PageWords)[];

/**
 * The widget words for one page: the tool's, with the page's own words in place of
 * them for the keys a page may change, and no others. Undefined for a tool with no widget.
 */
export function pageWords(tool: Tool, page: ToolPage): ToolWidgetWords | undefined {
  if (!tool.widget) return undefined;
  const own: Partial<PageWords> = {};
  const take = <K extends keyof PageWords>(key: K) => {
    const value = page.words?.[key];
    if (value !== undefined) own[key] = value;
  };
  for (const key of pageWordKeys) take(key);
  return { ...tool.widget, ...own };
}

/** The file types a page accepts: its own list if it has one, else the tool's. */
export function acceptsFor({ tool, page }: PageWithTool): string[] {
  return page.accepts ?? tool.accepts;
}
