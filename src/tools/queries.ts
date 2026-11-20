// Plain functions over the registry. No DOM and no rendering, so they run in
// Node and could be reused by an app with different views.

import { withBase } from '../site';
import type { Group, GroupId, PageWords, Tool, ToolPage, ToolWidgetWords } from './registry';

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
