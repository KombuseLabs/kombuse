import { findAndReplace } from 'mdast-util-find-and-replace'
import type { Root, Link } from 'mdast'

const PROFILE_MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g

export function remarkProfileMentions() {
  return function (tree: Root): undefined {
    findAndReplace(tree, [
      [
        PROFILE_MENTION_REGEX,
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
