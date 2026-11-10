// Plain functions over the registry. No DOM and no rendering, so they run in
// Node and could be reused by an app with different views.

import { withBase } from '../site';
import type { Group, GroupId, Tool, ToolPage } from './registry';

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

/** `base` is the site's base path: "/" at the root, or a sub-path for a preview. */
export function toListItem(page: ToolPage, base = '/'): ListItem {
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
export function groupsWithItems(groups: Group[], tools: Tool[], base = '/'): GroupWithItems[] {
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

/** The related tools of a tool that are published, in the order the tool names them. */
export function relatedItems(tools: Tool[], tool: Tool, base = '/'): ListItem[] {
  const published = new Map(allPages(tools).map(({ page }) => [page.slug, page]));
  return tool.related.flatMap((slug) => {
    const page = published.get(slug);
    return page ? [toListItem(page, base)] : [];
  });
}

/** The file types a page accepts: its own list if it has one, else the tool's. */
export function acceptsFor({ tool, page }: PageWithTool): string[] {
  return page.accepts ?? tool.accepts;
}
