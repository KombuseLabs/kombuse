import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

// New format: @[Display Name](profile-id)
const MENTION_LINK_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g

// Legacy format: @single-word-name
const LEGACY_MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g

export function remarkProfileMentions() {
  return function (tree: Root): undefined {
    // Process new format first so these become link nodes
    findAndReplace(tree, [
      [
        MENTION_LINK_REGEX,
        (_: string, displayName: string, profileId: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: `mention://${profileId}`,
            children: [{ type: 'text', value: `@${displayName}` }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference'] })

    // Then process legacy format (link nodes from above are ignored)
    findAndReplace(tree, [
      [
        LEGACY_MENTION_REGEX,
        (_: string, name: string) => {
          const link: Link = {
            type: 'link',
            title: null,
            url: `mention://${name}`,
            children: [{ type: 'text', value: `@${name}` }],
          }
          return link
        },
      ],
    ], { ignore: ['link', 'linkReference'] })
  }
}
