/**
 * The tree of the posts of a thread (FR-16).
 *
 * The API returns the posts **chronological** and flat: a reply points at
 * its parent with `parentPostId` (a logical self-reference — there is no
 * foreign key on it). The tree is built here so the UI can nest the
 * replies.
 *
 * A post whose parent is **not** in the page (the parent was deleted, or it
 * lives on another page) becomes a root: a reply is never lost because its
 * parent is missing.
 */

import type { PostDto } from '$lib/api/types';

/** A post and the replies under it. */
export interface PostNode {
  /** The post itself. */
  readonly post: PostDto;
  /** The replies under the post, in the order the API returned them. */
  readonly children: PostNode[];
}

/**
 * Builds the tree of a page of posts.
 *
 * The order of the roots and of the children follows the order of the API
 * (chronological); the tree never re-orders anything.
 */
export function buildPostTree(posts: readonly PostDto[]): PostNode[] {
  const nodes = new Map<string, PostNode>();
  for (const post of posts) {
    nodes.set(post.id, { post, children: [] });
  }

  const roots: PostNode[] = [];

  for (const post of posts) {
    const node = nodes.get(post.id);
    if (node === undefined) {
      continue;
    }

    const parentId = post.parentPostId;
    const parent = parentId === null ? undefined : nodes.get(parentId);

    if (parent === undefined || parent === node) {
      // A top-level post, or an orphan: its parent is not on this page.
      roots.push(node);
      continue;
    }

    parent.children.push(node);
  }

  return roots;
}

/** The number of posts of a tree — the roots and their replies. */
export function countPosts(nodes: readonly PostNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countPosts(node.children), 0);
}
