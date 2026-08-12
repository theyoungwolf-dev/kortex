"use client";

import * as React from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

import { cn } from "@/lib/utils";
import type { SidebarSection, TreeItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { TreeRow, type TreeRowDragState } from "@/components/tree/tree-row";
import { TreeRowActions } from "@/components/tree/tree-row-actions";

/* ---------------------------------------------------------------------------
   The sidebar tree.

   This is the one genuinely stateful part of the shell, and it owns exactly
   three things: which nodes are expanded, which node is selected, and what is
   being dragged. It receives a flat, already-ordered, serialisable array from
   the server and never fetches, sorts or derives visibility rules of its own.

   The reorder it emits is the shape the Route Handler expects
   (ARCHITECTURE.md §7.1): (itemId, newParentId, prevId). Computing the rank
   is the server's job -- doing it here would put the collision retry in a tab
   that can close mid-flight.
   --------------------------------------------------------------------------- */

export interface TreeReorder {
  itemId: string;
  newParentId: string | null;
  /** The sibling the item now follows; null means it became the first child. */
  prevId: string | null;
}

export interface SidebarTreeProps {
  sections: SidebarSection[];
  activeId?: string;
  initialExpandedIds?: string[];
  /**
   * Prefix for every link, e.g. "/w/ty-wolf". A string rather than a
   * hrefFor callback because a Server Component cannot pass a function
   * across the boundary into a client component.
   */
  basePath?: string;
  onReorder?: (move: TreeReorder) => void;
  onCreateChild?: (parentId: string) => void;
  onCreateInSection?: (sectionId: string) => void;
}

export function SidebarTree({
  sections,
  activeId,
  initialExpandedIds = [],
  basePath = "",
  onReorder,
  onCreateChild,
  onCreateInSection,
}: SidebarTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(initialExpandedIds),
  );
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [dragging, setDragging] = React.useState<string | null>(null);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSection = React.useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <DragDropProvider
      onDragStart={(event) => setDragging(String(event.operation.source?.id))}
      onDragEnd={(event) => {
        setDragging(null);
        const { source, target } = event.operation;
        if (!source || !target || source.id === target.id) return;
        const move = resolveMove(
          sections,
          String(source.id),
          String(target.id),
        );
        if (move) onReorder?.(move);
      }}
    >
      <nav aria-label="Collections" className="flex flex-col gap-0.5">
        {sections.map((section) => {
          const isCollapsed = collapsedSections.has(section.id);
          const visible = visibleItems(section.items, expanded);
          return (
            <section key={section.id} className="flex flex-col gap-0.5">
              <SectionHeader
                section={section}
                isCollapsed={isCollapsed}
                onToggle={() => toggleSection(section.id)}
                onAdd={
                  section.canAdd
                    ? () => onCreateInSection?.(section.id)
                    : undefined
                }
              />

              {isCollapsed ? null : visible.length === 0 &&
                section.emptyPrompt ? (
                <EmptyPrompt {...section.emptyPrompt} />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {visible.map((item, index) => (
                    <SortableTreeRow
                      key={item.id}
                      item={item}
                      index={index}
                      group={section.id}
                      isActive={item.id === activeId}
                      isExpanded={expanded.has(item.id)}
                      isDragging={dragging === item.id}
                      basePath={basePath}
                      onToggle={() => toggle(item.id)}
                      onCreateChild={onCreateChild}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </nav>
    </DragDropProvider>
  );
}

/* ------------------------------------------------------------------------- */

interface SortableTreeRowProps {
  item: TreeItem;
  index: number;
  group: string;
  isActive: boolean;
  isExpanded: boolean;
  isDragging: boolean;
  basePath: string;
  onToggle: () => void;
  onCreateChild?: (parentId: string) => void;
}

function SortableTreeRow({
  item,
  index,
  group,
  isActive,
  isExpanded,
  isDragging,
  basePath,
  onToggle,
  onCreateChild,
}: SortableTreeRowProps) {
  const { ref, handleRef, isDropTarget } = useSortable({
    id: item.id,
    index,
    group,
    data: { depth: item.depth, parentId: parentOf(item) },
  });

  const dragState: TreeRowDragState | undefined = isDragging
    ? "lifted"
    : isDropTarget
      ? "into"
      : undefined;

  return (
    <li>
      <TreeRow
        item={item}
        href={hrefFor(item, basePath)}
        isActive={isActive}
        isExpanded={isExpanded}
        dragState={dragState}
        onToggle={onToggle}
        containerProps={{ ref }}
        actions={
          <TreeRowActions
            item={item}
            handleRef={handleRef}
            onCreateChild={onCreateChild}
          />
        }
      />
    </li>
  );
}

/* ------------------------------------------------------------------------- */

interface SectionHeaderProps {
  section: SidebarSection;
  isCollapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}

function SectionHeader({
  section,
  isCollapsed,
  onToggle,
  onAdd,
}: SectionHeaderProps) {
  return (
    <div className="group/section flex items-center gap-1.5 px-2 pt-3.5 pb-1.25">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        data-expanded={isCollapsed ? undefined : ""}
        className="flex items-center gap-1.5 text-muted-foreground transition-colors duration-state ease-kortex hover:text-ink"
      >
        <svg
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          data-expanded={isCollapsed ? undefined : ""}
          className="size-2.25 transition-transform duration-expand ease-kortex data-expanded:rotate-90"
        >
          <path
            d="M3.5 2L6.5 5L3.5 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="eyebrow">{section.label}</span>
      </button>
      {onAdd ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={onAdd}
          aria-label={`New collection in ${section.label}`}
          className="ml-auto opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100"
        >
          <PlusGlyph />
        </Button>
      ) : null}
    </div>
  );
}

function EmptyPrompt({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-1 flex flex-col gap-1.5 rounded-card border border-dashed border-border-strong px-3.5 py-4">
      <span className="text-label font-mid text-ink-2">{title}</span>
      <span className="text-meta leading-normal text-muted-foreground">
        {body}
      </span>
    </div>
  );
}

export function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn("size-3", className)}
    >
      <path
        d="M6 2.5v7M2.5 6h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Pure helpers. Kept out of the component so they stay testable.
   --------------------------------------------------------------------------- */

function parentOf(item: TreeItem): string | null {
  return item.kind === "collection" ? null : item.parentId;
}

function hrefFor(item: TreeItem, basePath: string): string {
  return item.kind === "collection"
    ? `${basePath}/c/${item.id}`
    : `${basePath}/p/${item.id}`;
}

/**
 * Walk the flat, depth-first array and drop anything beneath a collapsed
 * node. Cheaper and simpler than rebuilding a nested tree, and it keeps the
 * array indices that the drag library sorts on contiguous.
 */
export function visibleItems(
  items: TreeItem[],
  expanded: Set<string>,
): TreeItem[] {
  const out: TreeItem[] = [];
  let hiddenBelow = Number.POSITIVE_INFINITY;

  for (const item of items) {
    if (item.depth > hiddenBelow) continue;
    hiddenBelow = Number.POSITIVE_INFINITY;
    out.push(item);
    if (item.hasChildren && !expanded.has(item.id)) hiddenBelow = item.depth;
  }
  return out;
}

/**
 * Turn a drop onto `targetId` into the (itemId, newParentId, prevId) triple
 * the reorder endpoint takes.
 *
 * Refuses a move into the dragged item's own subtree -- the same rule the
 * BEFORE UPDATE cycle guard enforces in Postgres (§6). Catching it here keeps
 * the invalid-drop affordance honest rather than optimistic.
 */
export function resolveMove(
  sections: SidebarSection[],
  itemId: string,
  targetId: string,
): TreeReorder | null {
  for (const section of sections) {
    const from = section.items.findIndex((i) => i.id === itemId);
    const to = section.items.findIndex((i) => i.id === targetId);
    if (from === -1 || to === -1) continue;

    if (isDescendant(section.items, from, targetId)) return null;

    const target = section.items[to];
    const newParentId = parentOf(target);
    const siblings = section.items.filter(
      (i) => i.id !== itemId && parentOf(i) === newParentId,
    );
    const at = siblings.findIndex((i) => i.id === targetId);
    return {
      itemId,
      newParentId,
      prevId: at <= 0 ? null : siblings[at - 1].id,
    };
  }
  return null;
}

function isDescendant(
  items: TreeItem[],
  ancestorIndex: number,
  candidateId: string,
): boolean {
  const depth = items[ancestorIndex].depth;
  for (let i = ancestorIndex + 1; i < items.length; i++) {
    if (items[i].depth <= depth) return false;
    if (items[i].id === candidateId) return true;
  }
  return false;
}
